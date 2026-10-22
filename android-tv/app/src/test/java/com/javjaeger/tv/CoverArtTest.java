package com.javjaeger.tv;

import org.junit.Test;
import static org.junit.Assert.*;

public class CoverArtTest {
    @Test public void keepsLoadedImageAspectRatioWithinOnePixel() {
        for (int[] size : new int[][]{{16, 9}, {3, 2}, {2, 3}, {1, 1}, {1920, 1080}, {719, 1081}}) {
            int height = CoverArt.scaledHeight(321, size[0], size[1]);
            assertEquals(321.0 * size[1] / size[0], height, 1.0);
        }
        assertEquals(180, CoverArt.scaledHeight(320, 16, 9));
        assertEquals(480, CoverArt.scaledHeight(320, 2, 3));
    }

    @Test public void usesLandscapePlaceholderForUnknownImagesAndBoundsInvalidWidths() {
        for (int[] size : new int[][]{{0, 0}, {-1, -1}, {16, 0}, {0, 9}, {-1, 9}})
            assertEquals(180, CoverArt.scaledHeight(320, size[0], size[1]));
        assertEquals(0, CoverArt.scaledHeight(0, 2, 3));
        assertEquals(0, CoverArt.scaledHeight(-1, 2, 3));
        assertEquals(Integer.MAX_VALUE, CoverArt.scaledHeight(Integer.MAX_VALUE, 2, 3));
    }

    @Test public void fixedHeightKeepsImageRatioAndUsesLandscapePlaceholder() {
        assertEquals(256, CoverArt.scaledWidth(144, 16, 9));
        assertEquals(216, CoverArt.scaledWidth(144, 3, 2));
        assertEquals(96, CoverArt.scaledWidth(144, 2, 3));
        assertEquals(144, CoverArt.scaledWidth(144, 1, 1));
        for (int[] size : new int[][]{{0, 0}, {-1, -1}, {16, 0}, {0, 9}})
            assertEquals(256, CoverArt.scaledWidth(144, size[0], size[1]));
        assertEquals(0, CoverArt.scaledWidth(0, 16, 9));
        assertEquals(0, CoverArt.scaledWidth(-1, 16, 9));
        assertEquals(Integer.MAX_VALUE, CoverArt.scaledWidth(Integer.MAX_VALUE, 3, 2));
    }

    @Test public void fitsAvailableHeightWithoutCroppingAndKeepsUnboundedWallsAndShelfHeight() {
        assertArrayEquals(new int[]{96, 240}, CoverArt.fitSize(240, 0, 160, 400, 240));
        assertArrayEquals(new int[]{240, 600}, CoverArt.fitSize(240, 0, 160, 400, -1));
        assertArrayEquals(new int[]{235, 132}, CoverArt.fitSize(256, 132, 16, 9, 300));
        assertArrayEquals(new int[]{178, 100}, CoverArt.fitSize(320, 0, 0, 0, 100));
        assertArrayEquals(new int[]{0, 0}, CoverArt.fitSize(240, 0, 160, 400, 0));
    }
}
