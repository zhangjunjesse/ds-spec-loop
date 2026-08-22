window.__ModuleLoader__.load({
	id: "dsh-spec-loop",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		const React = require("react");

		const CSS = [
			".ds-spec-loop-toggle {",
			"  display: inline-flex; align-items: center; gap: 6px;",
			"  height: 24px; padding: 0 10px; border-radius: 12px;",
			"  border: 1px solid rgba(128,128,128,0.35);",
			"  background: transparent; color: inherit; opacity: .75;",
			"  font-size: 12px; line-height: 1; cursor: pointer; user-select: none;",
			"  transition: opacity .15s ease, border-color .15s ease, background .15s ease;",
			"}",
			".ds-spec-loop-toggle:hover { opacity: 1; }",
			".ds-spec-loop-toggle:disabled { opacity: .4; cursor: default; }",
			".ds-spec-loop-dot { width: 7px; height: 7px; border-radius: 50%; background: rgba(128,128,128,.6); transition: background .15s ease; }",
			".ds-spec-loop-toggle.is-on { opacity: 1; border-color: rgba(59,130,246,.6); color: rgb(59,130,246); background: rgba(59,130,246,.08); }",
			".ds-spec-loop-toggle.is-on .ds-spec-loop-dot { background: rgb(59,130,246); }",
		].join("\n");

		async function callApi(sessionId, enabled) {
			const body = enabled === undefined ? { sessionId } : { sessionId, enabled };
			const res = await fetch("/spec-loop/api", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(body),
			});
			if (!res.ok) throw new Error("spec-loop api " + res.status);
			const data = await res.json();
			return data.enabled === true;
		}

		function SpecLoopToggle(props) {
			const sessionId = props.sessionId;
			const [enabled, setEnabled] = React.useState(null);
			const [busy, setBusy] = React.useState(false);
			React.useEffect(() => {
				let alive = true;
				callApi(sessionId)
					.then((on) => { if (alive) setEnabled(on); })
					.catch(() => { if (alive) setEnabled(false); });
				return () => { alive = false; };
			}, [sessionId]);
			const on = enabled === true;
			const toggle = () => {
				if (busy || enabled === null) return;
				setBusy(true);
				callApi(sessionId, !on)
					.then((next) => setEnabled(next))
					.catch((error) => { console.error("dsh-spec-loop: toggle failed", error); })
					.finally(() => setBusy(false));
			};
			return React.createElement(
				"button",
				{
					type: "button",
					className: "ds-spec-loop-toggle" + (on ? " is-on" : ""),
					title: on ? "谨慎模式已开启（ds-spec-loop 技能常驻上下文），点击关闭" : "开启谨慎模式：将 ds-spec-loop 技能常驻上下文",
					"aria-pressed": on,
					disabled: enabled === null || busy,
					onClick: toggle,
				},
				React.createElement("span", { className: "ds-spec-loop-dot" }),
				"谨慎模式",
			);
		}

		exports.name = "dsh-spec-loop";
		exports.inject = ["slots"];
		exports.apply = (ctx) => {
			ctx.effect(() => {
				const el = document.createElement("style");
				el.textContent = CSS;
				document.head.appendChild(el);
				return () => { el.remove(); };
			}, "dsh-spec-loop: styles");

			ctx.slots.inject("conversation.input.left", () => ctx.slots.register(
				{ name: "conversation.input.left", id: "ds-spec-loop-toggle", order: 10, label: "谨慎模式" },
				(props) => React.createElement(SpecLoopToggle, { sessionId: props.sessionId }),
			));
		};

		return module.exports;
	},
});
