"use client";

import { Checkbox } from "@/components/Controls";

/**
 * A cookbook's "Use website photos" switch (see `websitePhotos` in
 * lib/bookPhotos.ts). A book holds back the photos recipes imported with from
 * websites, because they belong to whoever published them. This lets the cook
 * use them anyway, knowing where they stand, the way an app asks before you
 * use music you don't own.
 */
export function WebsitePhotosOption({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <Checkbox
      className="website-photos-option"
      label="Use website photos"
      checked={checked}
      onChange={(event) => onChange(event.target.checked)}
      hint={
        <>
          Fine for gifts, not for books you sell.{" "}
          <a href="/terms#copyright-in-recipes" target="_blank" rel="noopener noreferrer">
            About photos
          </a>
        </>
      }
    />
  );
}
