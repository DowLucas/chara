/* global React, TopBar, IconButton, ListRow, AvatarStack, Stamp, Button, Avatar */

const GroupDetailScreen = ({ group, onBack, onSettle, onAdd }) => {
  const expenses = [
    { id: "e1", title: "Lilla Ego, dinner",   meta: "Mo paid · split 4 ways",    amount: "−420 kr", tone: "neg" },
    { id: "e2", title: "Wine round",          meta: "You paid · split 4 ways",   amount: "+180 kr", tone: "pos" },
    { id: "e3", title: "Spotify family",      meta: "Recurring · split 5 ways",  amount: "+39 kr",  tone: "pos" },
    { id: "e4", title: "Train, Sthlm → Malmö", meta: "Settled · 14 Apr",         amount: "−640 kr", settled: true },
    { id: "e5", title: "Groceries, ICA",      meta: "Mo paid · split 3 ways",    amount: "−120 kr", tone: "neg" },
    { id: "e6", title: "Birthday gift, Lina", meta: "You paid · split 5 ways",   amount: "+240 kr", tone: "pos" },
  ];
  return (
    <>
      <TopBar
        title=""
        left={<IconButton icon="arrow-left" onClick={onBack} />}
        right={<>
          <IconButton icon="users" />
          <IconButton icon="more-horizontal" />
        </>}
      />
      <div className="scroll">
        <div className="hero">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--lead)", letterSpacing: "0.02em" }}>group</div>
              <div style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 28, letterSpacing: "-0.03em", color: "var(--graphite)", marginTop: 2 }}>
                {group?.name || "Apartment 4B"}
              </div>
            </div>
            <AvatarStack people={["AL", "MO", "EJ"]} />
          </div>
          <div className="eyebrow" style={{ marginTop: 18 }}>your balance</div>
          <div className="balance pos">+1 240 kr</div>
          <hr className="rule" />
          <div className="sub"><span className="l">Mo owes you</span><span className="v">760 kr</span></div>
          <div className="sub"><span className="l">Eli owes you</span><span className="v">480 kr</span></div>
        </div>

        <div style={{ padding: "0 20px 6px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--lead)" }}>expenses · {expenses.length}</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--lead)" }}>this month</span>
          </div>
          <hr style={{ border: 0, borderBottom: "1.5px solid var(--graphite)", margin: 0 }} />
        </div>

        <div className="list">
          {expenses.map(e => (
            <ListRow
              key={e.id}
              title={e.title}
              meta={e.meta}
              amount={e.amount}
              amountTone={e.tone}
              settled={e.settled}
            />
          ))}
        </div>
        <div style={{ height: 12 }} />
      </div>
      <div className="cta-bar">
        <Button kind="secondary" onClick={onAdd}>Add expense</Button>
        <Button kind="primary" onClick={onSettle}>Settle</Button>
      </div>
    </>
  );
};

window.GroupDetailScreen = GroupDetailScreen;
