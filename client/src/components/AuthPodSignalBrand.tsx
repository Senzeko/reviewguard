import './AuthPodSignal.css';

export function AuthPodSignalBrand({ variant = 'center' }: { variant?: 'center' | 'inline' }) {
  const inner = (
    <>
      <div className="auth-ps-logo" aria-hidden>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M12 14a3 3 0 003-3V5a3 3 0 10-6 0v6a3 3 0 003 3zm5-3a5 5 0 01-10 0H5a7 7 0 0014 0h-2zm-5 8a2 2 0 002-2h-4a2 2 0 002 2z"
            fill="currentColor"
          />
        </svg>
      </div>
      <span className="auth-ps-brand-name">PodSignal</span>
    </>
  );

  if (variant === 'inline') {
    return <div className="auth-ps-brand auth-ps-brand--inline">{inner}</div>;
  }

  return <div className="auth-ps-brand">{inner}</div>;
}
