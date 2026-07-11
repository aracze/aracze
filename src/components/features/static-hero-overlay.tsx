interface StaticHeroOverlayProps {
  filterId?: string;
}

export const StaticHeroOverlay = ({
  filterId = "blurFilter",
}: StaticHeroOverlayProps) => {
  return (
    <div className="absolute top-0 left-0 right-0 mx-auto w-full max-w-[800px] h-full opacity-30 z-[100] flex items-center justify-center pointer-events-none overflow-hidden">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 80.34 40.73"
        className="w-full h-auto"
      >
        <defs>
          <filter id={filterId} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="5" />
          </filter>
        </defs>
        <path
          filter={`url(#${filterId})`}
          fill="black"
          d="M68.08,23.76a12.24,12.24,0,0,1-7.59,3.12A70.6,70.6,0,0,0,50.88,28,15.8,15.8,0,0,0,47,29.26,42.49,42.49,0,0,1,39.51,31a26.17,26.17,0,0,1-4.77.25,1.29,1.29,0,0,0-.75.07,3.38,3.38,0,0,1-1.26-.14,9.61,9.61,0,0,1-2.51.14l.25-.07a.45.45,0,0,0-.25.07,47,47,0,0,1-7.49-.7,13.18,13.18,0,0,1-5.37-2.37,33.35,33.35,0,0,1-5.68-5.2,7.47,7.47,0,0,1-1.79-4.31,6.81,6.81,0,0,1,1.39-4.69c1.82-2.45,4.42-3.39,7.29-3.74,2.71-.33,5.46-.43,8.17-.85l.82-.14a7.65,7.65,0,0,1,2.24-.14h.14a1.21,1.21,0,0,1,.67-.14h4.94a1.18,1.18,0,0,1,.67.14,7.65,7.65,0,0,1,2.24.14,6.4,6.4,0,0,0,2.14.11,36.48,36.48,0,0,0,4.31.09c1-.06,2.07-.08,3.1-.08a38.05,38.05,0,0,1,7,.93c2.23.43,4.44,1,6.69,1.36a13.3,13.3,0,0,1,5.49,2.09C70.83,16.34,71.46,20.54,68.08,23.76Z"
        />
      </svg>
    </div>
  );
};
