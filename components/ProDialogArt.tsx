"use client";

import { useState } from "react";
import Image from "next/image";
import { ChevronLeftIcon, ChevronRightIcon, ICON_SIZE } from "@/components/icons";
import type { ProDialogImage } from "@/lib/proUpgradeCopy";

/**
 * The Pro dialog's picture: the left half on a computer, a band across the
 * top of the phone sheet. One image for an opening about one feature; several
 * when nothing narrower opened it, which the cook steps through with the
 * arrows or dots. It never turns on its own (Amelia, 2026-11-17).
 */
export function ProDialogArt({ images, className }: { images: ProDialogImage[]; className?: string }) {
  const [index, setIndex] = useState(0);
  const count = images.length;
  const step = (by: number) => setIndex((i) => (i + by + count) % count);

  if (count === 0) return null;
  return (
    <div className={`pro-dialog-art ${className ?? ""}`}>
      {images.map((image, i) => (
        <div
          key={image.src}
          className={i === index ? "pro-dialog-art__slide is-active" : "pro-dialog-art__slide"}
          style={image.backdrop ? { background: image.backdrop } : undefined}
          aria-hidden={i === index ? undefined : true}
        >
          <Image
            src={image.src}
            alt={i === index ? image.alt : ""}
            fill
            sizes="(max-width: 640px) 100vw, 400px"
            priority={i === 0}
            loading={i === 0 ? undefined : "eager"}
            className={image.backdrop ? "pro-dialog-art__image is-whole" : "pro-dialog-art__image"}
          />
        </div>
      ))}
      {count > 1 && (
        <>
          <button
            type="button"
            className="pro-dialog-art__arrow pro-dialog-art__arrow--prev"
            aria-label="Previous picture"
            onClick={() => step(-1)}
          >
            <ChevronLeftIcon size={ICON_SIZE.md} />
          </button>
          <button
            type="button"
            className="pro-dialog-art__arrow pro-dialog-art__arrow--next"
            aria-label="Next picture"
            onClick={() => step(1)}
          >
            <ChevronRightIcon size={ICON_SIZE.md} />
          </button>
          <div className="pro-dialog-art__dots">
            {images.map((image, i) => (
              <button
                key={image.src}
                type="button"
                className={i === index ? "pro-dialog-art__dot is-active" : "pro-dialog-art__dot"}
                aria-label={`Show picture ${i + 1} of ${count}`}
                aria-current={i === index ? true : undefined}
                onClick={() => setIndex(i)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
