//go:build integration

package handler_test

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"image"
	_ "image/jpeg"
	"io"
	"net/http"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/DowLucas/chara/internal/server"
	"github.com/DowLucas/chara/testutil"
)

// attachEnv is the common setup for attachment tests: two groups, three
// users (alice/bob share group A, carol is alone in group C), an expense
// in each group, and a router wired up to real MinIO storage.
type attachEnv struct {
	env       *testutil.Env
	alice     testUserEnv
	bob       testUserEnv
	carol     testUserEnv
	groupAB   string
	groupC    string
	aliceMem  string
	bobMem    string
	carolMem  string
	expenseAB string // expense in groupAB, paid by alice
	expenseC  string // expense in groupC, paid by carol
}

func setupAttachEnv(t *testing.T) attachEnv {
	t.Helper()
	env := testutil.NewEnv(t)
	store := testutil.SharedStorage(t)
	env.Router = server.New(env.Config, env.Pool, env.Queries, env.JWT, store)

	a := testutil.CreateUser(t, env.Pool, uniqueEmail(t, "alice"), "Alice")
	b := testutil.CreateUser(t, env.Pool, uniqueEmail(t, "bob"), "Bob")
	c := testutil.CreateUser(t, env.Pool, uniqueEmail(t, "carol"), "Carol")

	gAB, aliceMem := testutil.CreateGroup(t, env.Pool, "AB Group", "SEK", a.ID, "Alice")
	bobMem := testutil.AddMember(t, env.Pool, gAB.ID, b.ID, "Bob")
	gC, carolMem := testutil.CreateGroup(t, env.Pool, "Carol Group", "SEK", c.ID, "Carol")

	expAB := testutil.CreateExpense(t, env.Pool, gAB.ID, "Dinner", 9000, "SEK", aliceMem.ID, a.ID, []string{aliceMem.ID, bobMem.ID})
	expC := testutil.CreateExpense(t, env.Pool, gC.ID, "Lunch", 5000, "SEK", carolMem.ID, c.ID, []string{carolMem.ID})

	return attachEnv{
		env:       env,
		alice:     testUserEnv{ID: a.ID, Email: a.Email, Token: env.MintToken(t, a.ID, a.Email)},
		bob:       testUserEnv{ID: b.ID, Email: b.Email, Token: env.MintToken(t, b.ID, b.Email)},
		carol:     testUserEnv{ID: c.ID, Email: c.Email, Token: env.MintToken(t, c.ID, c.Email)},
		groupAB:   gAB.ID,
		groupC:    gC.ID,
		aliceMem:  aliceMem.ID,
		bobMem:    bobMem.ID,
		carolMem:  carolMem.ID,
		expenseAB: expAB.Expense.ID,
		expenseC:  expC.Expense.ID,
	}
}

func uploadAttachBody(data []byte, mime string) string {
	return fmt.Sprintf(`{"image_base64": %q, "mime_type": %q}`,
		base64.StdEncoding.EncodeToString(data), mime)
}

func postAttachment(t *testing.T, e attachEnv, token, groupID, expenseID string, data []byte, mime string) *http.Response {
	t.Helper()
	req := e.env.AuthRequest(t, http.MethodPost,
		"/api/groups/"+groupID+"/expenses/"+expenseID+"/attachments",
		uploadAttachBody(data, mime), token)
	return e.env.Do(t, req).Result()
}

func TestAttachment_Create_Success(t *testing.T) {
	e := setupAttachEnv(t)
	img := makeJPEGBytes(t, 200, 200)
	resp := postAttachment(t, e, e.alice.Token, e.groupAB, e.expenseAB, img, "image/jpeg")
	require.Equal(t, http.StatusCreated, resp.StatusCode)

	var body map[string]any
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
	id := body["id"].(string)
	require.NotEmpty(t, id)

	rows, err := e.env.Queries.ListAttachmentsByExpense(context.Background(), e.expenseAB)
	require.NoError(t, err)
	require.Len(t, rows, 1)

	store := testutil.SharedStorage(t)
	obj, err := store.Open(context.Background(), rows[0].S3Key)
	require.NoError(t, err)
	obj.Close()
}

func TestAttachment_Create_NonMember_403(t *testing.T) {
	e := setupAttachEnv(t)
	resp := postAttachment(t, e, e.carol.Token, e.groupAB, e.expenseAB, makeJPEGBytes(t, 100, 100), "image/jpeg")
	assert.Equal(t, http.StatusForbidden, resp.StatusCode)
}

func TestAttachment_Create_ExpenseInOtherGroup_404(t *testing.T) {
	e := setupAttachEnv(t)
	// Alice is a member of groupAB but expenseC belongs to groupC. Should
	// 404 without leaking that the expense exists elsewhere.
	resp := postAttachment(t, e, e.alice.Token, e.groupAB, e.expenseC, makeJPEGBytes(t, 100, 100), "image/jpeg")
	assert.Equal(t, http.StatusNotFound, resp.StatusCode)
}

func TestAttachment_Create_UnsupportedMime_400(t *testing.T) {
	e := setupAttachEnv(t)
	resp := postAttachment(t, e, e.alice.Token, e.groupAB, e.expenseAB, makeJPEGBytes(t, 100, 100), "application/pdf")
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)

	resp = postAttachment(t, e, e.alice.Token, e.groupAB, e.expenseAB, makeJPEGBytes(t, 100, 100), "image/gif")
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

func TestAttachment_Create_OversizedImage_413(t *testing.T) {
	e := setupAttachEnv(t)
	// 7 MB of bytes — over the 6 MB cap. MaxBytesReader may also surface
	// as 400 when the inflated base64 exceeds the JSON cap; accept either.
	big := bytes.Repeat([]byte{0xFF, 0xD8, 0xFF, 0xE0}, 7*1024*1024/4)
	resp := postAttachment(t, e, e.alice.Token, e.groupAB, e.expenseAB, big, "image/jpeg")
	assert.Contains(t, []int{http.StatusRequestEntityTooLarge, http.StatusBadRequest}, resp.StatusCode)
}

func TestAttachment_Create_InvalidBase64_400(t *testing.T) {
	e := setupAttachEnv(t)
	body := `{"image_base64": "!!!not-base64!!!", "mime_type": "image/jpeg"}`
	req := e.env.AuthRequest(t, http.MethodPost,
		"/api/groups/"+e.groupAB+"/expenses/"+e.expenseAB+"/attachments",
		body, e.alice.Token)
	rr := e.env.Do(t, req)
	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestAttachment_List_SameGroup_OK(t *testing.T) {
	e := setupAttachEnv(t)
	require.Equal(t, http.StatusCreated,
		postAttachment(t, e, e.alice.Token, e.groupAB, e.expenseAB, makeJPEGBytes(t, 100, 100), "image/jpeg").StatusCode)

	req := e.env.AuthRequest(t, http.MethodGet,
		"/api/groups/"+e.groupAB+"/expenses/"+e.expenseAB+"/attachments", "", e.bob.Token)
	rr := e.env.Do(t, req)
	require.Equal(t, http.StatusOK, rr.Code)

	var list []map[string]any
	require.NoError(t, json.NewDecoder(rr.Body).Decode(&list))
	assert.Len(t, list, 1)
}

func TestAttachment_List_NonMember_403(t *testing.T) {
	e := setupAttachEnv(t)
	req := e.env.AuthRequest(t, http.MethodGet,
		"/api/groups/"+e.groupAB+"/expenses/"+e.expenseAB+"/attachments", "", e.carol.Token)
	rr := e.env.Do(t, req)
	assert.Equal(t, http.StatusForbidden, rr.Code)
}

func TestAttachment_Content_Proxy_OK(t *testing.T) {
	e := setupAttachEnv(t)
	src := makeJPEGBytes(t, 150, 150)
	resp := postAttachment(t, e, e.alice.Token, e.groupAB, e.expenseAB, src, "image/jpeg")
	require.Equal(t, http.StatusCreated, resp.StatusCode)
	var body map[string]any
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
	id := body["id"].(string)

	req := e.env.AuthRequest(t, http.MethodGet,
		"/api/groups/"+e.groupAB+"/expenses/"+e.expenseAB+"/attachments/"+id+"/content",
		"", e.alice.Token)
	rr := e.env.Do(t, req)
	require.Equal(t, http.StatusOK, rr.Code)
	got, err := io.ReadAll(rr.Body)
	require.NoError(t, err)
	assert.True(t, bytes.Equal(src, got), "served bytes must match uploaded bytes")

	// Decode roundtrip sanity check.
	_, _, err = image.Decode(bytes.NewReader(got))
	assert.NoError(t, err)
}

func TestAttachment_Content_CrossExpense_404(t *testing.T) {
	e := setupAttachEnv(t)
	// Upload on expenseAB, then try to fetch using a *different* expense
	// ID in the URL (we use expenseC owned by another group, but for the
	// chain check we just need any other valid expenseID in the same
	// group). Create a second expense in groupAB.
	other := testutil.CreateExpense(t, e.env.Pool, e.groupAB, "Other", 1000, "SEK", e.aliceMem, e.alice.ID, []string{e.aliceMem, e.bobMem})

	resp := postAttachment(t, e, e.alice.Token, e.groupAB, e.expenseAB, makeJPEGBytes(t, 100, 100), "image/jpeg")
	require.Equal(t, http.StatusCreated, resp.StatusCode)
	var body map[string]any
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
	id := body["id"].(string)

	req := e.env.AuthRequest(t, http.MethodGet,
		"/api/groups/"+e.groupAB+"/expenses/"+other.Expense.ID+"/attachments/"+id+"/content",
		"", e.alice.Token)
	rr := e.env.Do(t, req)
	assert.Equal(t, http.StatusNotFound, rr.Code)
}

func TestAttachment_Content_NonMember_403(t *testing.T) {
	e := setupAttachEnv(t)
	resp := postAttachment(t, e, e.alice.Token, e.groupAB, e.expenseAB, makeJPEGBytes(t, 100, 100), "image/jpeg")
	require.Equal(t, http.StatusCreated, resp.StatusCode)
	var body map[string]any
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
	id := body["id"].(string)

	req := e.env.AuthRequest(t, http.MethodGet,
		"/api/groups/"+e.groupAB+"/expenses/"+e.expenseAB+"/attachments/"+id+"/content",
		"", e.carol.Token)
	rr := e.env.Do(t, req)
	assert.Equal(t, http.StatusForbidden, rr.Code)
}

func TestAttachment_Delete_Success(t *testing.T) {
	e := setupAttachEnv(t)
	resp := postAttachment(t, e, e.alice.Token, e.groupAB, e.expenseAB, makeJPEGBytes(t, 100, 100), "image/jpeg")
	require.Equal(t, http.StatusCreated, resp.StatusCode)
	var body map[string]any
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
	id := body["id"].(string)

	req := e.env.AuthRequest(t, http.MethodDelete,
		"/api/groups/"+e.groupAB+"/expenses/"+e.expenseAB+"/attachments/"+id,
		"", e.alice.Token)
	rr := e.env.Do(t, req)
	require.Equal(t, http.StatusNoContent, rr.Code)

	rows, err := e.env.Queries.ListAttachmentsByExpense(context.Background(), e.expenseAB)
	require.NoError(t, err)
	assert.Len(t, rows, 0)
}

func TestAttachment_Delete_RemovesBucketObject(t *testing.T) {
	e := setupAttachEnv(t)
	resp := postAttachment(t, e, e.alice.Token, e.groupAB, e.expenseAB, makeJPEGBytes(t, 100, 100), "image/jpeg")
	require.Equal(t, http.StatusCreated, resp.StatusCode)
	var body map[string]any
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
	id := body["id"].(string)

	rows, err := e.env.Queries.ListAttachmentsByExpense(context.Background(), e.expenseAB)
	require.NoError(t, err)
	require.Len(t, rows, 1)
	key := rows[0].S3Key

	req := e.env.AuthRequest(t, http.MethodDelete,
		"/api/groups/"+e.groupAB+"/expenses/"+e.expenseAB+"/attachments/"+id,
		"", e.alice.Token)
	require.Equal(t, http.StatusNoContent, e.env.Do(t, req).Code)

	store := testutil.SharedStorage(t)
	_, err = store.Open(context.Background(), key)
	assert.Error(t, err, "stored object should be gone after delete")
}

func TestAttachment_Delete_NonOwnerMember_OK(t *testing.T) {
	e := setupAttachEnv(t)
	// Alice uploads; Bob (a co-member) deletes. Group-resource semantics
	// mirror the expense edit policy.
	resp := postAttachment(t, e, e.alice.Token, e.groupAB, e.expenseAB, makeJPEGBytes(t, 100, 100), "image/jpeg")
	require.Equal(t, http.StatusCreated, resp.StatusCode)
	var body map[string]any
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
	id := body["id"].(string)

	req := e.env.AuthRequest(t, http.MethodDelete,
		"/api/groups/"+e.groupAB+"/expenses/"+e.expenseAB+"/attachments/"+id,
		"", e.bob.Token)
	rr := e.env.Do(t, req)
	assert.Equal(t, http.StatusNoContent, rr.Code)
}

func TestAttachment_Delete_NonMember_403(t *testing.T) {
	e := setupAttachEnv(t)
	resp := postAttachment(t, e, e.alice.Token, e.groupAB, e.expenseAB, makeJPEGBytes(t, 100, 100), "image/jpeg")
	require.Equal(t, http.StatusCreated, resp.StatusCode)
	var body map[string]any
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
	id := body["id"].(string)

	req := e.env.AuthRequest(t, http.MethodDelete,
		"/api/groups/"+e.groupAB+"/expenses/"+e.expenseAB+"/attachments/"+id,
		"", e.carol.Token)
	rr := e.env.Do(t, req)
	assert.Equal(t, http.StatusForbidden, rr.Code)
}

func TestAttachment_Create_MimeMismatch_400(t *testing.T) {
	e := setupAttachEnv(t)
	// Claim image/jpeg but ship text bytes; the MIME sniffer should detect
	// text/plain and the upload must be rejected.
	resp := postAttachment(t, e, e.alice.Token, e.groupAB, e.expenseAB,
		[]byte("just some plain text not an image at all here"), "image/jpeg")
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

func TestAttachment_Content_SecurityHeaders(t *testing.T) {
	e := setupAttachEnv(t)
	src := makeJPEGBytes(t, 150, 150)
	resp := postAttachment(t, e, e.alice.Token, e.groupAB, e.expenseAB, src, "image/jpeg")
	require.Equal(t, http.StatusCreated, resp.StatusCode)
	var body map[string]any
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
	id := body["id"].(string)

	req := e.env.AuthRequest(t, http.MethodGet,
		"/api/groups/"+e.groupAB+"/expenses/"+e.expenseAB+"/attachments/"+id+"/content",
		"", e.alice.Token)
	rr := e.env.Do(t, req)
	require.Equal(t, http.StatusOK, rr.Code)
	assert.Equal(t, "nosniff", rr.Header().Get("X-Content-Type-Options"))
	cd := rr.Header().Get("Content-Disposition")
	assert.Contains(t, cd, "inline")
	assert.Contains(t, cd, ".jpg")
}

func TestExpense_SoftDelete_CleansAttachments(t *testing.T) {
	e := setupAttachEnv(t)
	// Upload two attachments to the same expense.
	for i := 0; i < 2; i++ {
		resp := postAttachment(t, e, e.alice.Token, e.groupAB, e.expenseAB, makeJPEGBytes(t, 100+i*10, 100), "image/jpeg")
		require.Equal(t, http.StatusCreated, resp.StatusCode)
	}
	rows, err := e.env.Queries.ListAttachmentsByExpense(context.Background(), e.expenseAB)
	require.NoError(t, err)
	require.Len(t, rows, 2)
	keys := []string{rows[0].S3Key, rows[1].S3Key}

	// Soft-delete the expense.
	req := e.env.AuthRequest(t, http.MethodDelete,
		"/api/groups/"+e.groupAB+"/expenses/"+e.expenseAB, "", e.alice.Token)
	require.Equal(t, http.StatusNoContent, e.env.Do(t, req).Code)

	// Attachment rows hard-deleted.
	rowsAfter, err := e.env.Queries.ListAttachmentsByExpense(context.Background(), e.expenseAB)
	require.NoError(t, err)
	assert.Len(t, rowsAfter, 0)

	// Bucket objects gone.
	store := testutil.SharedStorage(t)
	for _, k := range keys {
		_, err := store.Open(context.Background(), k)
		assert.Error(t, err, "bucket key %s should be gone", k)
	}
}
