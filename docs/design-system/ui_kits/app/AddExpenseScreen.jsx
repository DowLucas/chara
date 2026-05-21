/* global React, TopBar, IconButton, Field, Button, Chip, AvatarStack */

const AddExpenseScreen = ({ onBack, onSave }) => {
  const [amount, setAmount] = React.useState("420");
  const [title, setTitle] = React.useState("Lilla Ego, dinner");
  const [cat, setCat] = React.useState("food");
  return (
    <>
      <TopBar
        title="New expense"
        left={<IconButton icon="x" onClick={onBack} />}
        right={<button className="icon-btn" style={{ width: "auto", padding: "0 8px", fontFamily: "var(--font-body)", fontSize: 15, color: "var(--vermillion)" }} onClick={onSave}>Save</button>}
      />
      <div className="scroll">
        <div className="hero" style={{ paddingTop: 8 }}>
          <div className="eyebrow">amount</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              style={{
                border: 0, outline: "none", background: "transparent",
                fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums",
                fontWeight: 500, fontSize: 56, letterSpacing: "-0.025em", lineHeight: 1,
                color: "var(--graphite)", width: 180
              }}
            />
            <span style={{ fontFamily: "var(--font-mono)", fontWeight: 500, fontSize: 24, color: "var(--lead)" }}>kr</span>
          </div>
          <hr className="rule" />
        </div>

        <Field label="title" value={title} onChange={setTitle} />

        <div className="field">
          <span className="label">category</span>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
            {["food", "rent", "transport", "groceries", "other"].map(c => (
              <span key={c} onClick={() => setCat(c)} style={{ cursor: "pointer" }}>
                <Chip kind={cat === c ? "solid" : ""}>{c}</Chip>
              </span>
            ))}
          </div>
        </div>

        <div className="field">
          <span className="label">paid by</span>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6 }}>
            <span style={{ fontFamily: "var(--font-body)", fontSize: 15, color: "var(--graphite)" }}>You</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--lead)" }}>·</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--vermillion)" }}>change</span>
          </div>
        </div>

        <div className="field" style={{ borderBottom: "none" }}>
          <span className="label">split between</span>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
            <AvatarStack people={["AL", "MO", "EJ"]} />
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--lead)" }}>equally · 3 ways</span>
          </div>
          <div style={{ marginTop: 14, padding: "12px 14px", border: "0.5px solid var(--rule-soft)", borderRadius: 6, background: "var(--bone)" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--graphite)" }}>Each owes</span>
              <span style={{ fontFamily: "var(--font-mono)", fontWeight: 500, fontSize: 13, color: "var(--graphite)" }}>140 kr</span>
            </div>
          </div>
        </div>
      </div>
      <div className="cta-bar">
        <Button kind="primary" onClick={onSave}>Add expense</Button>
      </div>
    </>
  );
};

window.AddExpenseScreen = AddExpenseScreen;
