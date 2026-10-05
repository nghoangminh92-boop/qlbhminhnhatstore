export const ml = month => month.slice(5) + '/' + month.slice(0, 4);
export const dm = date => date.slice(8) + '/' + date.slice(5, 7);
export const Empty = ({ children }) => <div className="empty">{children}</div>;
