/* global React, TopBar, IconButton, Section, ListRow, AvatarStack, TabBar, Avatar, Stamp */

const GroupsScreen = ({ onOpenGroup, onAdd }) => {
  const groups = [
    { id: "g1", name: "Apartment 4B", members: ["AL", "MO", "EJ"], balance: +1240, last: "Spotify family · Mon" },
    { id: "g2", name: "Friday at Lilla Ego", members: ["AL", "MO", "EJ", "KK"], balance: -85, last: "Wine round · Fri" },
    { id: "g3", name: "Norrland trip", members: ["AL", "MO"], balance: 0, last: "Train · 14 Apr", settled: true },
    { id: "g4", name: "Birthday gift, Lina", members: ["AL", "MO", "EJ", "KK", "FL"], balance: -240, last: "Sephora · 03 May" },
  ];
  const fmt = (n) => (n === 0 ? "0 kr" : (n > 0 ? "+" : "−") + Math.abs(n).toLocaleString("sv-SE") + " kr");
  const tone = (n) => (n === 0 ? "" : n > 0 ? "pos" : "neg");

  return (
    <>
      <TopBar
        title="Groups"
        right={<>
          <IconButton icon="search" label="Search" />
          <IconButton icon="plus" label="New group" onClick={onAdd} />
        </>}
      />
      <div className="scroll">
        <Section eyebrow="net balance" title="+915 kr">
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12 }}>
            <span style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--lead)" }}>You're owed</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--moss)" }}>+1 240 kr</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
            <span style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--lead)" }}>You owe</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--brick)" }}>−325 kr</span>
          </div>
        </Section>

        <div style={{ padding: "0 20px 6px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--lead)" }}>groups · 4</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--lead)" }}>sort: recent</span>
          </div>
          <hr style={{ border: 0, borderBottom: "1.5px solid var(--graphite)", margin: 0 }} />
        </div>

        <div className="list">
          {groups.map(g => (
            <ListRow
              key={g.id}
              title={<span style={g.settled ? { color: "var(--lead)" } : null}>{g.name}</span>}
              meta={g.last}
              onClick={() => onOpenGroup && onOpenGroup(g)}
              right={
                g.settled
                  ? <Stamp />
                  : <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                      <span className={"amt " + tone(g.balance)} style={{ fontFamily: "var(--font-mono)", fontWeight: 500, fontSize: 17, letterSpacing: "-0.02em", color: g.balance > 0 ? "var(--moss)" : "var(--brick)" }}>
                        {fmt(g.balance)}
                      </span>
                      <AvatarStack people={g.members} />
                    </div>
              }
            />
          ))}
        </div>
      </div>
      <TabBar active="groups" onChange={() => {}} />
    </>
  );
};

window.GroupsScreen = GroupsScreen;
