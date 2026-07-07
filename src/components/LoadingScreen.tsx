import { LoaderCircle } from 'lucide-react';
import appLogo from '../assets/icon-invert2.png';

// Full-screen loading state: app logo, a continuously spinning loader, and a short
// status message. Shared by the router pending components and the shell bootstrap.
export const LoadingScreen: React.FC<{ message: string }> = ({ message }) => (
  <div className="h-screen flex flex-col items-center justify-center gap-5 bg-canvas text-fg/40 text-sm">
    <img src={appLogo} alt="" className="w-16 h-16" />
    <LoaderCircle className="w-6 h-6 animate-spin [animation-duration:2s] text-fg/60" />
    <p>{message}</p>
  </div>
);
