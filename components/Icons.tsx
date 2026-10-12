type P = { className?: string };
const s = (d: React.ReactNode, fill = false) =>
  function Icon({ className }: P) {
    return <svg viewBox="0 0 24 24" className={`i${fill ? " f" : ""} ${className ?? ""}`} aria-hidden="true">{d}</svg>;
  };

export const Play = s(<path d="M7 4v16l13-8z" />, true);
export const Back = s(<path d="m15 18-6-6 6-6" />);
export const Up = s(<path d="m18 15-6-6-6 6" />);
export const Down = s(<path d="m6 9 6 6 6-6" />);
export const Close = s(<path d="M6 6l12 12M18 6 6 18" />);
export const Heart = s(<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z" />);
export const Chat = s(<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />);
export const Share = s(<path d="M14 4l7 7-7 7M21 11H9a6 6 0 0 0-6 6v2" />);
export const List = s(<path d="M4 6h16M4 12h16M4 18h10" />);
export const Lock = s(<><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>);
export const Check = s(<path d="M5 12l5 5 9-10" />);
export const Send = s(<path d="m22 2-7 20-4-9-9-4z" />);
export const Bookmark = s(<path d="M6 3h12v18l-6-4-6 4z" />);
