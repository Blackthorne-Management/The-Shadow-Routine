/** Cliffs, a pagoda with lit windows, stairs, a pine and a waterfall, in ink tones. */
export default function TempleScene() {
  return (
    <svg className="scene-art" viewBox="0 0 340 210" preserveAspectRatio="xMidYMax slice" aria-hidden>
      <path d="M0 210 L0 70 C10 60 18 40 30 30 C40 45 44 70 52 90 L60 210Z" fill="#2a2a2a" />
      <path d="M250 210 L256 60 C262 40 275 18 290 8 C300 30 306 60 312 80 L318 210Z" fill="#2a2a2a" />
      <path d="M-4 210 L-4 20 C8 10 20 6 30 16 C38 30 40 60 44 90 C48 120 60 150 70 210Z" fill="#121212" />
      <path d="M186 210 C190 170 200 150 210 132 C220 118 240 110 262 108 L340 104 L340 210Z" fill="#121212" />
      <g fill="#000">
        <rect x="266" y="56" width="4" height="10" />
        <path d="M248 70 Q268 60 288 70 L284 73 Q268 66 252 73Z" />
        <rect x="256" y="72" width="24" height="10" />
        <path d="M238 86 Q268 72 298 86 L293 90 Q268 80 243 90Z" />
        <rect x="248" y="89" width="40" height="11" />
        <path d="M226 103 Q268 86 310 103 L304 107 Q268 95 232 107Z" />
        <rect x="238" y="106" width="60" height="14" />
      </g>
      <g fill="#c3342b" opacity=".85">
        <rect x="262" y="76" width="3" height="5" /><rect x="271" y="76" width="3" height="5" />
        <rect x="254" y="92" width="3" height="6" /><rect x="266" y="92" width="3" height="6" /><rect x="278" y="92" width="3" height="6" />
        <rect x="244" y="109" width="3" height="8" /><rect x="256" y="109" width="3" height="8" /><rect x="268" y="109" width="3" height="8" /><rect x="280" y="109" width="3" height="8" /><rect x="290" y="109" width="3" height="8" />
      </g>
      <path d="M232 120 L262 120 L240 210 L206 210Z" fill="#262626" />
      <g fill="#050505">
        <path d="M112 210 L116 150 L119 210Z" />
        <ellipse cx="104" cy="150" rx="22" ry="8" /><ellipse cx="126" cy="143" rx="20" ry="7" /><ellipse cx="114" cy="134" rx="15" ry="6" />
      </g>
      <rect x="170" y="40" width="10" height="170" fill="#fff" opacity=".22" />
    </svg>
  );
}
