// Placeholder mark for the Echo fork — replaces the Handy hand logo,
// which is not open source. Waveform bars matching the Echo palette.
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
    aria-label="Echo"
  >
    <g stroke="none">
      <rect x="18" y="57" width="14" height="21" rx="7" />
      <rect x="38" y="44" width="14" height="47" rx="7" />
      <rect x="58" y="30" width="14" height="75" rx="7" />
      <rect x="78" y="44" width="14" height="47" rx="7" />
      <rect x="98" y="57" width="14" height="21" rx="7" />
    </g>
  </svg>
);

export default HandyHand;
