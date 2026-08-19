// Placeholder mark for the Parler fork — replaces the Handy hand logo,
// which is not open source. Simple microphone glyph (speech + privacy theme).
const HandyHand = ({
  width,
  height,
}: {
  width?: number | string;
  height?: number | string;
}) => (
  <svg
    width={width || 126}
    height={height || 135}
    viewBox="0 0 126 135"
    className="fill-text stroke-text"
    xmlns="http://www.w3.org/2000/svg"
    role="img"
    aria-label="Parler"
  >
    <g stroke="none">
      <rect x="48" y="18" width="30" height="56" rx="15" />
      <rect x="59" y="99" width="8" height="18" />
      <rect x="42" y="117" width="42" height="8" rx="4" />
    </g>
    <path
      d="M36 66 v6 a27 27 0 0 0 54 0 v-6"
      fill="none"
      strokeWidth="8"
      strokeLinecap="round"
    />
  </svg>
);

export default HandyHand;
