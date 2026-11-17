import { getImageProps } from "next/image";

/**
 * The photo above the button, cropped to the 3:2 the slot shows.
 *
 * It used to be the portrait original (the gallery's copy, 1333x2000) with
 * CSS cropping it, so two thirds of every download was cut off on arrival,
 * and a phone asked for the 1200px file because `sizes` said 100vw. The slot
 * is the page minus its 24px gutters, up to 400px, so that is what `sizes`
 * says now.
 */
export const COOKBOOK_HERO = {
  src: "/images/printed-cards/cookbook-hero.jpg",
  alt: "A printed, spiral-bound cookbook open to a recipe for Greek chicken souvlaki",
  width: 1333,
  height: 889,
  sizes: "(max-width: 448px) calc(100vw - 48px), 400px",
} as const;

let heroRequested = false;

/**
 * Fetch the hero into the browser's cache before the tab is opened.
 *
 * The Cookbook tab is client state, so nothing on it exists until it is
 * tapped, and `priority` can only start the download at that moment: the
 * photo arrived a round trip and a file later than the tab did. A detached
 * image with the same `srcSet` and `sizes` picks the same file the real one
 * will, so by the time the tab opens it is already here.
 */
export function preloadCookbookHero() {
  if (heroRequested || typeof window === "undefined") return;
  heroRequested = true;
  const { props } = getImageProps(COOKBOOK_HERO);
  const img = new window.Image();
  // `sizes` before `srcset`, so the first pick is made against the right width.
  if (props.sizes) img.sizes = props.sizes;
  if (props.srcSet) img.srcset = props.srcSet;
  img.src = props.src;
  img.decode?.().catch(() => undefined);
}
