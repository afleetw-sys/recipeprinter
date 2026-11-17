"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import type { ProDialogImage } from "@/lib/proUpgradeCopy";

const TURN_MS = 4000;

/**
 * The Pro dialog's picture: the left half on a computer, a band across the
 * top of the phone sheet. One image for an opening about one feature; several
 * take turns, with dots to pick one, when nothing narrower opened it. Turns
 * stop for anyone who asks for less motion, and once the cook picks a dot.
 */
export function ProDialogArt({ images, className }: { images: ProDialogImage[]; className?: string }) {
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState(false);
  const count = images.length;

  useEffect(() => {
    if (count < 2 || picked) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => setIndex((i) => (i + 1) % count), TURN_MS);
    return () => window.clearInterval(timer);
  }, [count, picked]);

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
        <div className="pro-dialog-art__dots">
          {images.map((image, i) => (
            <button
              key={image.src}
              type="button"
              className={i === index ? "pro-dialog-art__dot is-active" : "pro-dialog-art__dot"}
              aria-label={`Show picture ${i + 1} of ${count}`}
              aria-current={i === index ? true : undefined}
              onClick={() => {
                setPicked(true);
                setIndex(i);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
