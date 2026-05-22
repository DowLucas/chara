/* global React, TopBar, IconButton, Button, Avatar, Stamp */

const SettleScreen = ({ onBack, onConfirm, onDone }) => {
  const [stage, setStage] = React.useState("review"); // review → done

  if (stage === "done") {
    return (
      <>
        <TopBar title="" left={<IconButton icon="x" onClick={onDone} />} />
        <div className="settled-screen">
          <Stamp size="lg" />
          <div className="h">Chara. Nice.</div>
          <div className="p">760 kr from Mo landed in your account.</div>
          <hr style={{ border: 0, borderBottom: "1.5px solid var(--graphite)", width: 180, margin: "8px 0" }} />
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--lead)", letterSpacing: "0.04em" }}>
            14 May 2026 · 14:32
          </div>
        </div>
        <div className="cta-bar">
          <Button kind="primary" onClick={onDone}>Done</Button>
        </div>
      </>
    );
  }

  return (
    <>
      <TopBar title="Settle up" left={<IconButton icon="arrow-left" onClick={onBack} />} />
      <div className="scroll">
        <div className="hero">
          <div className="eyebrow">you collect</div>
          <div className="balance pos">+1 240 kr</div>
          <hr className="rule" />
        </div>

        <div className="list">
          <div className="list-row">
            <div className="l" style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 12 }}>
              <Avatar initials="MO" />
              <div style={{ display: "flex", flexDirection: "column" }}>
                <div style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 16, letterSpacing: "-0.02em", color: "var(--graphite)" }}>Mo Ahmadi</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--lead)" }}>via Swish · 070 123 45 67</div>
              </div>
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontWeight: 500, fontSize: 17, color: "var(--moss)" }}>760 kr</div>
          </div>
          <div className="list-row">
            <div className="l" style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 12 }}>
              <Avatar initials="EJ" />
              <div style={{ display: "flex", flexDirection: "column" }}>
                <div style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 16, letterSpacing: "-0.02em", color: "var(--graphite)" }}>Eli Johansson</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--lead)" }}>via Swish · 073 987 65 43</div>
              </div>
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontWeight: 500, fontSize: 17, color: "var(--moss)" }}>480 kr</div>
          </div>
        </div>

        <div style={{ padding: "20px", marginTop: 8 }}>
          <div style={{ background: "var(--bone)", border: "0.5px solid var(--rule-soft)", borderRadius: 8, padding: "16px 18px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--lead)" }}>Total to collect</span>
              <span style={{ fontFamily: "var(--font-mono)", fontWeight: 500, fontSize: 22, color: "var(--graphite)" }}>1 240 kr</span>
            </div>
            <hr style={{ border: 0, borderBottom: "1.5px solid var(--graphite)", margin: "10px 0 8px" }} />
            <div style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--lead)" }}>
              Requests sent via Swish. Reconciled when they pay.
            </div>
          </div>
        </div>
      </div>
      <div className="cta-bar">
        <Button kind="primary" onClick={() => setStage("done")}>Send via Swish</Button>
      </div>
    </>
  );
};

window.SettleScreen = SettleScreen;
