package importer

import (
	"bytes"
	"fmt"
	"image"
	"image/color"
	"image/draw"
	"image/jpeg"
	_ "image/png" // register PNG decoder
	"math"

	xdraw "golang.org/x/image/draw"
)

// maxMergedWidth bounds the merged image width so high-DPI screenshots don't
// produce a needlessly huge attachment.
const maxMergedWidth = 1080

// MergeImagesVertically decodes each image (jpeg/png), scales them to a common
// width, stacks them top-to-bottom, and encodes the result as a single JPEG
// that fits under maxBytes (stepping quality / downscaling as needed). No DB,
// no model — pure and unit-tested.
func MergeImagesVertically(images []Image, maxBytes int) ([]byte, error) {
	if len(images) == 0 {
		return nil, fmt.Errorf("importer: no images to merge")
	}

	decoded := make([]image.Image, 0, len(images))
	width := 0
	for _, im := range images {
		img, _, err := image.Decode(bytes.NewReader(im.Data))
		if err != nil {
			return nil, fmt.Errorf("importer: decode image: %w", err)
		}
		decoded = append(decoded, img)
		if w := img.Bounds().Dx(); w > width {
			width = w
		}
	}
	if width > maxMergedWidth {
		width = maxMergedWidth
	}

	// Scaled height of each image at the common width.
	heights := make([]int, len(decoded))
	totalH := 0
	for i, img := range decoded {
		b := img.Bounds()
		h := b.Dy()
		if b.Dx() != width {
			h = int(math.Round(float64(b.Dy()) * float64(width) / float64(b.Dx())))
		}
		heights[i] = h
		totalH += h
	}

	canvas := image.NewRGBA(image.Rect(0, 0, width, totalH))
	draw.Draw(canvas, canvas.Bounds(), image.NewUniform(color.White), image.Point{}, draw.Src)
	y := 0
	for i, img := range decoded {
		dst := image.Rect(0, y, width, y+heights[i])
		if img.Bounds().Dx() == width {
			draw.Draw(canvas, dst, img, img.Bounds().Min, draw.Src)
		} else {
			xdraw.CatmullRom.Scale(canvas, dst, img, img.Bounds(), draw.Over, nil)
		}
		y += heights[i]
	}

	return encodeUnder(canvas, maxBytes)
}

// encodeUnder encodes img as JPEG, stepping quality down and then downscaling
// the whole image until the result fits under maxBytes (or a small floor is
// reached). Returns the smallest encoding it produced.
func encodeUnder(img image.Image, maxBytes int) ([]byte, error) {
	qualities := []int{85, 70, 55, 40}
	cur := img
	for {
		var smallest []byte
		for _, q := range qualities {
			var buf bytes.Buffer
			if err := jpeg.Encode(&buf, cur, &jpeg.Options{Quality: q}); err != nil {
				return nil, fmt.Errorf("importer: encode merged jpeg: %w", err)
			}
			b := buf.Bytes()
			if len(b) <= maxBytes {
				return b, nil
			}
			smallest = b
		}
		// Still over budget at lowest quality: downscale 25% and retry.
		b := cur.Bounds()
		nw, nh := b.Dx()*3/4, b.Dy()*3/4
		if nw < 64 || nh < 64 {
			return smallest, nil // floor reached; return best effort
		}
		down := image.NewRGBA(image.Rect(0, 0, nw, nh))
		xdraw.CatmullRom.Scale(down, down.Bounds(), cur, b, draw.Over, nil)
		cur = down
	}
}
