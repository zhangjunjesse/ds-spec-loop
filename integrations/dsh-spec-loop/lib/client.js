window.__ModuleLoader__.load({
	id: "dsh-spec-loop",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		const React = require("react");

		const CSS = [
			".ds-spec-loop-wrap { display: inline-flex; align-items: center; gap: 4px; }",
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
			".ds-spec-loop-edit {",
			"  display: inline-flex; align-items: center; justify-content: center;",
			"  width: 24px; height: 24px; border-radius: 12px; padding: 0;",
			"  border: 1px solid rgba(128,128,128,0.35); background: transparent;",
			"  color: inherit; opacity: .6; cursor: pointer; font-size: 12px; line-height: 1;",
			"}",
			".ds-spec-loop-edit:hover { opacity: 1; }",
			".ds-spec-loop-edit:disabled { opacity: .3; cursor: default; }",
			".ds-spec-loop-backdrop {",
			"  position: fixed; inset: 0; z-index: 2147483000;",
			"  background: rgba(0,0,0,.45); display: flex; align-items: center; justify-content: center;",
			"}",
			".ds-spec-loop-panel {",
			"  width: min(880px, 92vw); max-height: 86vh; display: flex; flex-direction: column;",
			"  background: var(--dsw-specific-input-major, #1c1c1c); color: var(--dsw-alias-label-primary, #eee);",
			"  border: 1px solid var(--dsw-alias-border-l2-darkmode-thin, rgba(128,128,128,.35));",
			"  border-radius: 14px; box-shadow: 0 16px 48px rgba(0,0,0,.45); overflow: hidden;",
			"}",
			".ds-spec-loop-head { display: flex; align-items: center; gap: 10px; padding: 14px 16px 10px; }",
			".ds-spec-loop-title { font-size: 14px; font-weight: 600; flex: 1; }",
			".ds-spec-loop-badge { font-size: 11px; padding: 2px 8px; border-radius: 999px; border: 1px solid rgba(128,128,128,.4); opacity: .8; }",
			".ds-spec-loop-badge.is-override { color: rgb(59,130,246); border-color: rgba(59,130,246,.6); opacity: 1; }",
			".ds-spec-loop-hint { padding: 0 16px 8px; font-size: 12px; opacity: .65; line-height: 1.6; }",
			".ds-spec-loop-body { padding: 0 16px; flex: 1; min-height: 0; display: flex; }",
			".ds-spec-loop-area {",
			"  flex: 1; min-height: 320px; resize: none; box-sizing: border-box;",
			"  font-family: var(--ds-font-family-code, ui-monospace, Consolas, monospace);",
			"  font-size: 12px; line-height: 1.65; padding: 12px;",
			"  color: inherit; background: rgba(128,128,128,.08);",
			"  border: 1px solid rgba(128,128,128,.28); border-radius: 8px; outline: none;",
			"}",
			".ds-spec-loop-foot { display: flex; align-items: center; gap: 8px; padding: 12px 16px 14px; }",
			".ds-spec-loop-status { flex: 1; font-size: 12px; opacity: .7; line-height: 1.5; }",
			".ds-spec-loop-status.is-error { color: rgb(239,68,68); opacity: 1; }",
			".ds-spec-loop-btn {",
			"  height: 28px; padding: 0 14px; border-radius: 8px; font-size: 12px; cursor: pointer;",
			"  border: 1px solid rgba(128,128,128,.4); background: transparent; color: inherit; flex: none;",
			"}",
			".ds-spec-loop-btn:hover:not(:disabled) { background: rgba(128,128,128,.12); }",
			".ds-spec-loop-btn:disabled { opacity: .45; cursor: default; }",
			".ds-spec-loop-btn.is-primary { background: rgb(59,130,246); border-color: rgb(59,130,246); color: #fff; }",
			".ds-spec-loop-btn.is-primary:hover:not(:disabled) { background: rgb(37,110,230); }",
		].join("\n");

		/** POST the loopback API; every shape answers the full state. */
		async function callApi(sessionId, patch) {
			const res = await fetch("/spec-loop/api", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(Object.assign({ sessionId }, patch || {})),
			});
			if (!res.ok) throw new Error("spec-loop api " + res.status);
			const data = await res.json();
			if (data.ok === false) throw new Error(data.error || "spec-loop api failed");
			return data;
		}

		function EditorPanel(props) {
			const state = props.state;
			const [draft, setDraft] = React.useState(state.text || "");
			const [busy, setBusy] = React.useState(false);
			const [error, setError] = React.useState(null);
			const dirty = draft !== (state.text || "");

			const run = (patch, after) => {
				setBusy(true);
				setError(null);
				callApi(props.sessionId, patch)
					.then((next) => {
						props.onState(next);
						if (after) after(next);
					})
					.catch((cause) => setError(cause instanceof Error ? cause.message : String(cause)))
					.finally(() => setBusy(false));
			};

			const status = error !== null
				? error
				: state.isOverride
					? "当前使用你编辑过的版本（存于 ~/.dsh/storages/spec-loop-prompt.md）"
					: "当前使用技能原文 SKILL.md；保存后写入独立覆盖文件，不改动原技能";

			return React.createElement(
				"div",
				{
					className: "ds-spec-loop-backdrop",
					onMouseDown: (event) => { if (event.target === event.currentTarget) props.onClose(); },
				},
				React.createElement(
					"div",
					{ className: "ds-spec-loop-panel", role: "dialog", "aria-label": "编辑注入提示词" },
					React.createElement(
						"div",
						{ className: "ds-spec-loop-head" },
						React.createElement("div", { className: "ds-spec-loop-title" }, "谨慎模式 · 注入提示词"),
						React.createElement(
							"span",
							{ className: "ds-spec-loop-badge" + (state.isOverride ? " is-override" : "") },
							state.isOverride ? "已自定义" : "技能原文",
						),
					),
					React.createElement(
						"div",
						{ className: "ds-spec-loop-hint" },
						"开启后，这段文本作为一条用户消息注入对话（外层包 <spec-loop> 标签），在聊天里可见；被压缩裁掉后会自动重新注入。",
					),
					React.createElement(
						"div",
						{ className: "ds-spec-loop-body" },
						React.createElement("textarea", {
							className: "ds-spec-loop-area",
							value: draft,
							spellCheck: false,
							disabled: busy,
							onChange: (event) => setDraft(event.target.value),
						}),
					),
					React.createElement(
						"div",
						{ className: "ds-spec-loop-foot" },
						React.createElement(
							"div",
							{ className: "ds-spec-loop-status" + (error !== null ? " is-error" : "") },
							status,
						),
						React.createElement(
							"button",
							{
								type: "button",
								className: "ds-spec-loop-btn",
								disabled: busy || !state.isOverride,
								title: "删除自定义覆盖，恢复使用 SKILL.md 原文",
								onClick: () => run({ reset: true }, (next) => setDraft(next.text || "")),
							},
							"恢复默认",
						),
						React.createElement(
							"button",
							{ type: "button", className: "ds-spec-loop-btn", disabled: busy, onClick: props.onClose },
							"关闭",
						),
						React.createElement(
							"button",
							{
								type: "button",
								className: "ds-spec-loop-btn is-primary",
								disabled: busy || !dirty,
								onClick: () => run({ text: draft }),
							},
							busy ? "保存中…" : "保存",
						),
					),
				),
			);
		}

		function SpecLoopToggle(props) {
			const sessionId = props.sessionId;
			const [state, setState] = React.useState(null);
			const [busy, setBusy] = React.useState(false);
			const [open, setOpen] = React.useState(false);

			React.useEffect(() => {
				let alive = true;
				callApi(sessionId)
					.then((next) => { if (alive) setState(next); })
					.catch(() => { if (alive) setState({ enabled: false, text: "", isOverride: false }); });
				return () => { alive = false; };
			}, [sessionId]);

			const on = state !== null && state.enabled === true;
			const toggle = () => {
				if (busy || state === null) return;
				setBusy(true);
				callApi(sessionId, { enabled: !on })
					.then((next) => setState(next))
					.catch((error) => { console.error("dsh-spec-loop: toggle failed", error); })
					.finally(() => setBusy(false));
			};

			return React.createElement(
				"div",
				{ className: "ds-spec-loop-wrap" },
				React.createElement(
					"button",
					{
						type: "button",
						className: "ds-spec-loop-toggle" + (on ? " is-on" : ""),
						title: on
							? "谨慎模式已开启（ds-spec-loop 注入为一条用户消息），点击关闭"
							: "开启谨慎模式：把 ds-spec-loop 注入为一条用户消息",
						"aria-pressed": on,
						disabled: state === null || busy,
						onClick: toggle,
					},
					React.createElement("span", { className: "ds-spec-loop-dot" }),
					"谨慎模式",
				),
				React.createElement(
					"button",
					{
						type: "button",
						className: "ds-spec-loop-edit",
						title: "查看/编辑注入的提示词",
						"aria-label": "查看或编辑注入的提示词",
						disabled: state === null,
						onClick: () => setOpen(true),
					},
					"✎",
				),
				open && state !== null
					? React.createElement(EditorPanel, {
						sessionId: sessionId,
						state: state,
						onState: setState,
						onClose: () => setOpen(false),
					})
					: null,
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
