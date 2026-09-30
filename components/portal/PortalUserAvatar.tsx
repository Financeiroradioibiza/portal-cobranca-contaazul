"use client";

import { useMemo, useState } from "react";
import { initials } from "@/lib/config/portalUserService";
import { portalUserAvatarUrl } from "@/lib/config/portalUserAvatar";

function avatarGradient(seed: string): string {
  const hues = [320, 260, 210, 170, 30, 280];
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h + seed.charCodeAt(i) * 17) % hues.length;
  const a = hues[h]!;
  const b = hues[(h + 2) % hues.length]!;
  return `linear-gradient(135deg, hsl(${a} 70% 45%), hsl(${b} 65% 50%))`;
}

const SIZE_CLASS = {
  xs: "h-6 w-6 text-[9px]",
  sm: "h-8 w-8 text-[10px]",
  md: "h-10 w-10 text-xs",
  lg: "h-12 w-12 text-sm",
} as const;

type Props = {
  userId?: string | null;
  displayName: string;
  email: string;
  hasAvatar?: boolean;
  avatarVersion?: string | number | null;
  size?: keyof typeof SIZE_CLASS;
  className?: string;
};

export function PortalUserAvatar({
  userId,
  displayName,
  email,
  hasAvatar,
  avatarVersion,
  size = "sm",
  className = "",
}: Props) {
  const [imgFailed, setImgFailed] = useState(false);
  const showPhoto = Boolean(userId && hasAvatar && !imgFailed);
  const src = useMemo(() => {
    if (!userId || !hasAvatar) return null;
    return portalUserAvatarUrl(userId, avatarVersion ?? undefined);
  }, [userId, hasAvatar, avatarVersion]);

  const cls = `${SIZE_CLASS[size]} shrink-0 overflow-hidden rounded-full font-bold text-white ${className}`;

  if (showPhoto && src) {
    return (
      <img
        src={src}
        alt=""
        className={`${cls} object-cover`}
        onError={() => setImgFailed(true)}
      />
    );
  }

  return (
    <span
      className={`${cls} inline-flex items-center justify-center`}
      style={{ background: avatarGradient(email) }}
      aria-hidden
    >
      {initials(displayName, email)}
    </span>
  );
}
