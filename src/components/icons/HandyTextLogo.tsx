import React from "react";

// Placeholder wordmark for the Parler fork — replaces the Handy brand logo,
// which is not open source. Swap in real brand art before release.
const BRAND_NAME = "Parler";

const HandyTextLogo = ({
  width,
  height,
  className,
}: {
  width?: number;
  height?: number;
  className?: string;
}) => {
  return (
    <svg
      width={width}
      height={height}
      className={className}
      viewBox="0 0 480 150"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Parler"
    >
      <text
        x="0"
        y="112"
        fontFamily="system-ui, -apple-system, sans-serif"
        fontSize="120"
        fontWeight="700"
        letterSpacing="-4"
        className="logo-primary"
      >
        {BRAND_NAME}
      </text>
      <circle cx="440" cy="100" r="16" fill="#e5484d" />
    </svg>
  );
};

export default HandyTextLogo;
