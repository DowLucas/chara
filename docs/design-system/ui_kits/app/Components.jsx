/* global React, ReactDOM, lucide */

const Icon = ({ name, size = 22, color = "currentColor", strokeWidth = 1.5 }) => {
  // Render Lucide icon as inline SVG via the lucide global; falls back to a small dot
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (ref.current && window.lucide && window.lucide.createIcons) {
      ref.current.innerHTML = `<i data-lucide="${name}"></i>`;
      window.lucide.createIcons({ attrs: { "stroke-width": strokeWidth, width: size, height: size, color } });
    }
  }, [name, size, color, strokeWidth]);
  return <span ref={ref} style={{ display: "inline-flex", lineHeight: 0 }} />;
};

const TopBar = ({ title, left, right }) => (
  <div className="topbar">
    <div className="left">{left}</div>
    <div className="title">{title}</div>
    <div className="right">{right}</div>
  </div>
);

const IconButton = ({ icon, onClick, label }) => (
  <button className="icon-btn" onClick={onClick} aria-label={label}>
    <Icon name={icon} />
  </button>
);

const Section = ({ eyebrow, title, children }) => (
  <div className="section">
    {eyebrow && <div className="eyebrow">{eyebrow}</div>}
    {title && <h2>{title}</h2>}
    <hr className="rule" />
    {children}
  </div>
);

const Avatar = ({ initials, size = "md", stack = false, style }) => (
  <span
    className={"avatar " + (size === "sm" ? "sm " : "") + (stack ? "stack" : "")}
    style={style}
  >
    {initials}
  </span>
);

const AvatarStack = ({ people, max = 4 }) => {
  const shown = people.slice(0, max);
  return (
    <span style={{ display: "inline-flex" }}>
      {shown.map((p, i) => (
        <Avatar key={i} initials={p} size="sm" stack={i > 0} />
      ))}
    </span>
  );
};

const Stamp = ({ size = "sm", style }) => (
  <span className={"stamp " + (size === "lg" ? "stamp-lg" : "")} style={style}>QUITS</span>
);

const ListRow = ({ title, meta, amount, amountTone, settled, onClick, right }) => (
  <div className={"list-row " + (settled ? "settled" : "")} onClick={onClick}>
    <div className="l">
      <div className="ttl">{title}</div>
      {meta && <div className="meta">{meta}</div>}
    </div>
    {right ? right : <div className={"amt " + (amountTone || "")}>{amount}</div>}
  </div>
);

const Button = ({ kind = "primary", children, onClick, style }) => (
  <button className={"btn btn-" + kind} onClick={onClick} style={style}>{children}</button>
);

const Chip = ({ children, kind }) => (
  <span className={"chip " + (kind || "")}>{children}</span>
);

const TabBar = ({ active, onChange }) => {
  const tabs = [
    { id: "groups",  icon: "users",     label: "Groups" },
    { id: "activity",icon: "list",      label: "Activity" },
    { id: "add",     icon: "plus",      label: "Add" },
    { id: "you",     icon: "user",      label: "You" },
  ];
  return (
    <div className="tabbar">
      {tabs.map(t => (
        <button
          key={t.id}
          className={"tab " + (active === t.id ? "active" : "")}
          onClick={() => onChange && onChange(t.id)}
        >
          <Icon name={t.icon} />
          <span>{t.label}</span>
        </button>
      ))}
    </div>
  );
};

const Field = ({ label, value, onChange, type = "text", amount = false, placeholder }) => (
  <div className={"field " + (amount ? "amount" : "")}>
    <span className="label">{label}</span>
    <input
      type={type}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange && onChange(e.target.value)}
    />
  </div>
);

const EmptyState = ({ title, body }) => (
  <div className="empty">
    <Icon name="receipt" size={28} color="var(--lead)" />
    <div className="h">{title}</div>
    {body && <div className="p">{body}</div>}
  </div>
);

Object.assign(window, {
  Icon, TopBar, IconButton, Section, Avatar, AvatarStack, Stamp,
  ListRow, Button, Chip, TabBar, Field, EmptyState
});
