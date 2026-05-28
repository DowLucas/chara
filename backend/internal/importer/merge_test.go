package importer_test

import (
	"bytes"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"testing"

	"github.com/DowLucas/chara/internal/importer"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// makePNG builds a solid-color PNG of the given dimensions for test input.
func makePNG(t *testing.T, w, h int, c color.Color) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, w, h))
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			img.Set(x, y, c)
		}
	}
	var buf bytes.Buffer
	require.NoError(t, png.Encode(&buf, img))
	return buf.Bytes()
}

// decodeDims decodes JPEG bytes and returns the image bounds.
func decodeDims(t *testing.T, data []byte) (int, int) {
	t.Helper()
	img, err := jpeg.Decode(bytes.NewReader(data))
	require.NoError(t, err)
	b := img.Bounds()
	return b.Dx(), b.Dy()
}

func TestMergeImagesVertically_StacksSameWidth(t *testing.T) {
	imgs := []importer.Image{
		{Data: makePNG(t, 200, 50, color.RGBA{255, 0, 0, 255}), MIMEType: "image/png"},
		{Data: makePNG(t, 200, 80, color.RGBA{0, 0, 255, 255}), MIMEType: "image/png"},
	}
	out, err := importer.MergeImagesVertically(imgs, 6*1024*1024)
	require.NoError(t, err)
	require.NotEmpty(t, out)

	w, h := decodeDims(t, out)
	assert.Equal(t, 200, w, "width is the common (target) width")
	assert.Equal(t, 130, h, "height is the sum of input heights")
}

func TestMergeImagesVertically_ScalesNarrowerToCommonWidth(t *testing.T) {
	imgs := []importer.Image{
		{Data: makePNG(t, 100, 40, color.RGBA{255, 0, 0, 255}), MIMEType: "image/png"}, // narrower
		{Data: makePNG(t, 200, 60, color.RGBA{0, 0, 255, 255}), MIMEType: "image/png"}, // widest → target 200
	}
	out, err := importer.MergeImagesVertically(imgs, 6*1024*1024)
	require.NoError(t, err)

	w, h := decodeDims(t, out)
	assert.Equal(t, 200, w)
	// 100x40 scaled to width 200 → 200x80; plus 200x60 = 140 total.
	assert.Equal(t, 140, h)
}

func TestMergeImagesVertically_CapsWidthAt1080(t *testing.T) {
	imgs := []importer.Image{
		{Data: makePNG(t, 2160, 100, color.RGBA{0, 128, 0, 255}), MIMEType: "image/png"},
	}
	out, err := importer.MergeImagesVertically(imgs, 6*1024*1024)
	require.NoError(t, err)

	w, h := decodeDims(t, out)
	assert.Equal(t, 1080, w, "width is capped at 1080")
	assert.Equal(t, 50, h, "2160x100 scaled to width 1080 → 1080x50")
}

func TestMergeImagesVertically_SingleImage(t *testing.T) {
	imgs := []importer.Image{
		{Data: makePNG(t, 300, 120, color.RGBA{10, 20, 30, 255}), MIMEType: "image/png"},
	}
	out, err := importer.MergeImagesVertically(imgs, 6*1024*1024)
	require.NoError(t, err)
	w, h := decodeDims(t, out)
	assert.Equal(t, 300, w)
	assert.Equal(t, 120, h)
}

func TestMergeImagesVertically_EmptyErrors(t *testing.T) {
	_, err := importer.MergeImagesVertically(nil, 6*1024*1024)
	assert.Error(t, err)
}

func TestMergeImagesVertically_StaysUnderMaxBytes(t *testing.T) {
	// Many tall, noisy images would blow past a tight cap unless the encoder
	// downscales/steps quality to fit.
	imgs := make([]importer.Image, 8)
	for i := range imgs {
		imgs[i] = importer.Image{Data: makePNG(t, 1080, 1920, noise(i)), MIMEType: "image/png"}
	}
	const cap = 400 * 1024
	out, err := importer.MergeImagesVertically(imgs, cap)
	require.NoError(t, err)
	assert.LessOrEqual(t, len(out), cap, "output must fit under maxBytes")
}

// noise returns a per-index color so the encoder can't trivially compress.
func noise(i int) color.Color {
	return color.RGBA{uint8(i * 37), uint8(i*91 + 13), uint8(i*53 + 7), 255}
}
