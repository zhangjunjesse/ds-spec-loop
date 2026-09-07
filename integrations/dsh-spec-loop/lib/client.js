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
			".ds-spec-loop-count { font-variant-numeric: tabular-nums; opacity: .8; }",
			".ds-spec-loop-warn { color: rgb(245,158,11); font-weight: 600; }",
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
			"  width: min(1180px, 94vw); height: min(760px, 88vh); display: flex; flex-direction: column;",
			"  background: var(--dsw-specific-input-major, #1c1c1c); color: var(--dsw-alias-label-primary, #eee);",
			"  border: 1px solid var(--dsw-alias-border-l2-darkmode-thin, rgba(128,128,128,.35));",
			"  border-radius: 14px; box-shadow: 0 16px 48px rgba(0,0,0,.45); overflow: hidden;",
			"}",
			".ds-spec-loop-head { display: flex; align-items: center; gap: 10px; padding: 14px 16px 8px; }",
			".ds-spec-loop-title { font-size: 14px; font-weight: 600; flex: 1; }",
			".ds-spec-loop-badge { font-size: 11px; padding: 2px 8px; border-radius: 999px; border: 1px solid rgba(128,128,128,.4); opacity: .8; }",
			".ds-spec-loop-badge.is-override { color: rgb(59,130,246); border-color: rgba(59,130,246,.6); opacity: 1; }",
			".ds-spec-loop-badge.is-stale { color: rgb(245,158,11); border-color: rgba(245,158,11,.6); opacity: 1; }",
			".ds-spec-loop-hint { padding: 0 16px 10px; font-size: 12px; opacity: .65; line-height: 1.6; }",
			// body = list rail + editor
			".ds-spec-loop-body { display: flex; gap: 12px; padding: 0 16px; flex: 1; min-height: 0; }",
			".ds-spec-loop-rail {",
			"  width: 236px; flex: none; display: flex; flex-direction: column; min-height: 0;",
			"  border: 1px solid rgba(128,128,128,.28); border-radius: 10px; background: rgba(128,128,128,.05);",
			"}",
			".ds-spec-loop-rail-head { display: flex; align-items: center; gap: 6px; padding: 8px 10px; font-size: 12px; opacity: .7; border-bottom: 1px solid rgba(128,128,128,.2); }",
			".ds-spec-loop-rail-list { flex: 1; min-height: 0; overflow-y: auto; padding: 6px; }",
			".ds-spec-loop-row {",
			"  display: flex; align-items: center; gap: 8px; padding: 7px 8px; border-radius: 8px;",
			"  cursor: pointer; font-size: 12px; line-height: 1.4;",
			"}",
			".ds-spec-loop-row:hover { background: rgba(128,128,128,.12); }",
			".ds-spec-loop-row.is-active { background: rgba(59,130,246,.14); box-shadow: inset 0 0 0 1px rgba(59,130,246,.45); }",
			".ds-spec-loop-row input { flex: none; cursor: pointer; accent-color: rgb(59,130,246); }",
			".ds-spec-loop-row-main { flex: 1; min-width: 0; }",
			".ds-spec-loop-row-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }",
			".ds-spec-loop-row-meta { font-size: 10px; opacity: .55; margin-top: 2px; font-variant-numeric: tabular-nums; }",
			".ds-spec-loop-row-meta .is-stale { color: rgb(245,158,11); opacity: 1; }",
			".ds-spec-loop-move { display: flex; flex-direction: column; gap: 1px; flex: none; opacity: 0; }",
			".ds-spec-loop-row:hover .ds-spec-loop-move { opacity: .7; }",
			".ds-spec-loop-move button { border: none; background: transparent; color: inherit; cursor: pointer; font-size: 9px; line-height: 1; padding: 1px 3px; }",
			".ds-spec-loop-move button:disabled { opacity: .25; cursor: default; }",
			".ds-spec-loop-rail-foot { padding: 6px; border-top: 1px solid rgba(128,128,128,.2); font-size: 11px; opacity: .65; display: flex; align-items: center; gap: 6px; }",
			".ds-spec-loop-mini {",
			"  height: 22px; padding: 0 8px; border-radius: 6px; font-size: 11px; cursor: pointer;",
			"  border: 1px solid rgba(128,128,128,.4); background: transparent; color: inherit;",
			"}",
			".ds-spec-loop-mini:hover:not(:disabled) { background: rgba(128,128,128,.15); }",
			".ds-spec-loop-mini:disabled { opacity: .4; cursor: default; }",
			// editor = title + [en | midbar | zh]
			".ds-spec-loop-editor { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 8px; }",
			".ds-spec-loop-name-input {",
			"  height: 30px; box-sizing: border-box; padding: 0 10px; font-size: 12px; color: inherit;",
			"  background: rgba(128,128,128,.08); border: 1px solid rgba(128,128,128,.28); border-radius: 8px; outline: none;",
			"}",
			".ds-spec-loop-name-input:focus { border-color: rgba(59,130,246,.6); }",
			".ds-spec-loop-panes { flex: 1; min-height: 0; display: grid; grid-template-columns: 1fr 92px 1fr; gap: 8px; }",
			".ds-spec-loop-pane { display: flex; flex-direction: column; min-width: 0; min-height: 0; }",
			".ds-spec-loop-pane-head { display: flex; align-items: baseline; gap: 6px; font-size: 11px; opacity: .7; padding: 0 2px 5px; }",
			".ds-spec-loop-pane-head .ds-spec-loop-pane-tag { font-weight: 600; opacity: 1; }",
			".ds-spec-loop-pane-head .ds-spec-loop-pane-note { margin-left: auto; font-variant-numeric: tabular-nums; opacity: .8; }",
			".ds-spec-loop-area {",
			"  flex: 1; min-height: 0; resize: none; box-sizing: border-box; width: 100%;",
			"  font-family: var(--ds-font-family-code, ui-monospace, Consolas, monospace);",
			"  font-size: 12px; line-height: 1.65; padding: 10px;",
			"  color: inherit; background: rgba(128,128,128,.08);",
			"  border: 1px solid rgba(128,128,128,.28); border-radius: 8px; outline: none;",
			"}",
			".ds-spec-loop-area:focus { border-color: rgba(59,130,246,.5); }",
			".ds-spec-loop-area.is-product { background: rgba(59,130,246,.05); }",
			".ds-spec-loop-mid { display: flex; flex-direction: column; align-items: stretch; justify-content: center; gap: 8px; }",
			".ds-spec-loop-mid .ds-spec-loop-btn { padding: 0 6px; }",
			".ds-spec-loop-foot { display: flex; align-items: center; gap: 8px; padding: 10px 16px 14px; }",
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
			".ds-spec-loop-btn.is-danger:hover:not(:disabled) { background: rgba(239,68,68,.15); color: rgb(239,68,68); }",
		].join("\n");

		const h = React.createElement;

		/** POST the loopback API; every non-translate shape answers the full state. */
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

		const message = (cause) => (cause instanceof Error ? cause.message : String(cause));
		/** Rough token feel for the cost hint; the exact number is not the point. */
		const approxTokens = (text) => Math.round(String(text || "").length / 3.2);

		function ManagerPanel(props) {
			const state = props.state;
			const items = state.items || [];
			const selected = state.selected || [];

			const [activeId, setActiveId] = React.useState(() => (items[0] ? items[0].id : null));
			const [draftTitle, setDraftTitle] = React.useState("");
			const [draftZh, setDraftZh] = React.useState("");
			const [draftEn, setDraftEn] = React.useState("");
			// The `zh` that produced the current English, carried into the save so
			// the server can mark the pair in sync. `undefined` = leave as stored.
			const [pending, setPending] = React.useState(undefined);
			const [busy, setBusy] = React.useState(false);
			const [translating, setTranslating] = React.useState(null);
			const [error, setError] = React.useState(null);
			const [notice, setNotice] = React.useState(null);

			const item = items.find((entry) => entry.id === activeId) || items[0] || null;
			const locked = busy || translating !== null;
			const dirty = item !== null
				&& (draftTitle !== item.title || draftZh !== item.zh || draftEn !== item.resolvedEn);

			/** Load the drafts whenever the edited item changes identity. */
			const loadDrafts = React.useCallback((entry) => {
				setDraftTitle(entry ? entry.title : "");
				setDraftZh(entry ? entry.zh : "");
				setDraftEn(entry ? entry.resolvedEn : "");
				setPending(undefined);
				setNotice(null);
				setError(null);
			}, []);

			React.useEffect(() => {
				loadDrafts(items.find((entry) => entry.id === activeId) || items[0] || null);
				// Only on an identity change: re-running on every state refresh would
				// throw away the user's in-flight edits.
				// eslint-disable-next-line react-hooks/exhaustive-deps
			}, [activeId]);

			/** Run one API call, push the new state up, optionally react to it. */
			const run = (patch, after) => {
				setBusy(true);
				setError(null);
				setNotice(null);
				return callApi(props.sessionId, patch)
					.then((next) => {
						props.onState(next);
						if (after) after(next);
					})
					.catch((cause) => setError(message(cause)))
					.finally(() => setBusy(false));
			};

			const switchTo = (id) => {
				if (id === activeId) return;
				if (dirty && !window.confirm("当前条目有未保存的修改，切换后会丢弃。继续？")) return;
				setActiveId(id);
			};

			const toggleSelected = (id) => {
				const next = selected.indexOf(id) === -1
					? selected.concat([id])
					: selected.filter((entry) => entry !== id);
				run({ selected: next });
			};

			const move = (id, delta) => {
				const order = items.map((entry) => entry.id);
				const at = order.indexOf(id);
				const to = at + delta;
				if (at === -1 || to < 0 || to >= order.length) return;
				order.splice(to, 0, order.splice(at, 1)[0]);
				run({ order: order });
			};

			const addItem = () => {
				const known = new Set(items.map((entry) => entry.id));
				run({ upsert: { title: "新条目" } }, (next) => {
					const created = (next.items || []).find((entry) => !known.has(entry.id));
					if (created) {
						setActiveId(created.id);
						loadDrafts(created);
					}
				});
			};

			const save = () => {
				if (item === null) return;
				// Keep an untouched builtin tracking SKILL.md instead of freezing a
				// copy of today's text into the library.
				const en = item.builtin && item.en === "" && draftEn === item.resolvedEn ? "" : draftEn;
				const patch = { id: item.id, title: draftTitle, zh: draftZh, en: en };
				if (pending !== undefined) patch.translatedFrom = pending;
				run({ upsert: patch }, (next) => {
					const saved = (next.items || []).find((entry) => entry.id === item.id);
					if (saved) loadDrafts(saved);
					setNotice("已保存" + (selected.indexOf(item.id) === -1 ? "（该条目当前未勾选，不会注入）" : "，下一步生效"));
				});
			};

			/**
			 * Translate one pane into the other. It only fills the editor — saving
			 * stays a separate click, which is what makes a bad translation
			 * recoverable.
			 */
			const translate = (direction) => {
				if (locked) return;
				const toEnglish = direction === "en";
				const source = toEnglish ? draftZh : draftEn;
				if (source.trim() === "") {
					setError(toEnglish ? "右侧中文是空的，没有内容可翻译" : "左侧英文是空的，没有内容可回译");
					return;
				}
				if (toEnglish && draftEn.trim() !== "") {
					// Warn only when the English on screen is human work rather than the
					// product of an earlier translation of this same source.
					const handWritten = item === null || item.translatedFrom === null || draftEn !== item.resolvedEn;
					if (handWritten && !window.confirm("左侧英文将被整段覆盖。继续？")) return;
				}
				setTranslating(direction);
				setError(null);
				setNotice(null);
				callApi(props.sessionId, {
					translate: { text: source, target: toEnglish ? "English" : "Simplified Chinese" },
				})
					.then((data) => {
						if (typeof data.translated !== "string" || data.translated === "") {
							setError("翻译结果为空");
							return;
						}
						if (toEnglish) {
							setDraftEn(data.translated);
							setPending(draftZh);
							setNotice("已译到左侧：检查后点「保存」——当前尚未保存");
						} else {
							setDraftZh(data.translated);
							setPending(data.translated);
							setNotice("已回译到右侧：这是从英文还原的中文草稿，检查后点「保存」");
						}
					})
					.catch((cause) => setError(message(cause)))
					.finally(() => setTranslating(null));
			};

			const selectedTokens = items
				.filter((entry) => selected.indexOf(entry.id) !== -1)
				.reduce((sum, entry) => sum + approxTokens(entry.resolvedEn), 0);
			const staleSelected = items.filter((entry) => entry.stale && selected.indexOf(entry.id) !== -1).length;

			const status = error !== null
				? error
				: notice !== null
					? notice
					: state.warning
						? state.warning
						: staleSelected > 0
							? "有 " + staleSelected + " 个已勾选条目的中文改过但没重新翻译，注入的仍是旧英文"
							: selected.length === 0
								? "当前没有勾选任何条目，不会注入"
								: "已勾选 " + selected.length + " 条，合并为一个 <spec-loop> 块注入，约 " + selectedTokens + " tokens";

			const rows = items.map((entry, index) =>
				h(
					"div",
					{
						key: entry.id,
						className: "ds-spec-loop-row" + (item !== null && entry.id === item.id ? " is-active" : ""),
						onClick: () => switchTo(entry.id),
					},
					h("input", {
						type: "checkbox",
						checked: selected.indexOf(entry.id) !== -1,
						disabled: locked,
						title: "勾选后注入本会话",
						onClick: (event) => event.stopPropagation(),
						onChange: () => toggleSelected(entry.id),
					}),
					h(
						"div",
						{ className: "ds-spec-loop-row-main" },
						h("div", { className: "ds-spec-loop-row-name" }, entry.title || "未命名条目"),
						h(
							"div",
							{ className: "ds-spec-loop-row-meta" },
							entry.builtin ? "内置 · " : "",
							approxTokens(entry.resolvedEn) + " tok",
							entry.stale ? h("span", { className: "is-stale" }, " · 待翻译") : null,
						),
					),
					h(
						"div",
						{ className: "ds-spec-loop-move", onClick: (event) => event.stopPropagation() },
						h(
							"button",
							{ type: "button", disabled: locked || index === 0, title: "上移", onClick: () => move(entry.id, -1) },
							"▲",
						),
						h(
							"button",
							{
								type: "button",
								disabled: locked || index === items.length - 1,
								title: "下移",
								onClick: () => move(entry.id, 1),
							},
							"▼",
						),
					),
				));

			return h(
				"div",
				{
					className: "ds-spec-loop-backdrop",
					onMouseDown: (event) => { if (event.target === event.currentTarget) props.onClose(); },
				},
				h(
					"div",
					{ className: "ds-spec-loop-panel", role: "dialog", "aria-label": "管理注入内容" },
					h(
						"div",
						{ className: "ds-spec-loop-head" },
						h("div", { className: "ds-spec-loop-title" }, "谨慎模式 · 注入内容管理"),
						item !== null && item.builtin
							? h(
								"span",
								{ className: "ds-spec-loop-badge" + (item.customised ? " is-override" : "") },
								item.customised ? "已自定义" : "技能原文",
							)
							: null,
						item !== null && item.stale
							? h("span", { className: "ds-spec-loop-badge is-stale" }, "待翻译")
							: null,
					),
					h(
						"div",
						{ className: "ds-spec-loop-hint" },
						"左侧勾选要注入的条目，可多选；勾选项按顺序合并成一条 <spec-loop> 用户消息注入本会话，被压缩裁掉后自动重注入。右边写中文，点「← 译到左侧」生成英文——只有左边的英文会发给模型，中文永远不会。",
					),
					h(
						"div",
						{ className: "ds-spec-loop-body" },
						h(
							"div",
							{ className: "ds-spec-loop-rail" },
							h(
								"div",
								{ className: "ds-spec-loop-rail-head" },
								h("span", { style: { flex: 1 } }, "注入条目"),
								h("span", null, selected.length + "/" + items.length),
							),
							h("div", { className: "ds-spec-loop-rail-list" }, rows),
							h(
								"div",
								{ className: "ds-spec-loop-rail-foot" },
								h(
									"button",
									{ type: "button", className: "ds-spec-loop-mini", disabled: locked, onClick: addItem },
									"+ 新建",
								),
								item !== null && !item.builtin
									? h(
										"button",
										{
											type: "button",
											className: "ds-spec-loop-mini",
											disabled: locked,
											title: "删除当前条目",
											onClick: () => {
												if (!window.confirm("删除条目「" + (item.title || "未命名条目") + "」？此操作不可撤销。")) return;
												run({ remove: item.id }, (next) => {
													const first = (next.items || [])[0] || null;
													setActiveId(first ? first.id : null);
													loadDrafts(first);
												});
											},
										},
										"删除",
									)
									: null,
							),
						),
						item === null
							? h("div", { className: "ds-spec-loop-editor" }, h("div", { className: "ds-spec-loop-hint" }, "还没有条目，点「+ 新建」开始。"))
							: h(
								"div",
								{ className: "ds-spec-loop-editor" },
								h("input", {
									className: "ds-spec-loop-name-input",
									value: draftTitle,
									disabled: locked,
									placeholder: "条目名称（只在这个面板里显示，不会注入）",
									onChange: (event) => setDraftTitle(event.target.value),
								}),
								h(
									"div",
									{ className: "ds-spec-loop-panes" },
									h(
										"div",
										{ className: "ds-spec-loop-pane" },
										h(
											"div",
											{ className: "ds-spec-loop-pane-head" },
											h("span", { className: "ds-spec-loop-pane-tag" }, "最终注入内容"),
											h("span", null, "英文 · 发给模型"),
											h("span", { className: "ds-spec-loop-pane-note" }, "≈" + approxTokens(draftEn) + " tok"),
										),
										h("textarea", {
											className: "ds-spec-loop-area is-product",
											value: draftEn,
											spellCheck: false,
											disabled: locked,
											placeholder: "这里是真正注入的英文内容。可以直接改，也可以从右边翻译过来。",
											onChange: (event) => setDraftEn(event.target.value),
										}),
									),
									h(
										"div",
										{ className: "ds-spec-loop-mid" },
										h(
											"button",
											{
												type: "button",
												className: "ds-spec-loop-btn is-primary",
												disabled: locked || draftZh.trim() === "",
												title: "用本会话当前的模型把右侧中文译成英文，填入左侧；不会自动保存",
												onClick: () => translate("en"),
											},
											translating === "en" ? "翻译中…" : "← 译到左侧",
										),
										h(
											"button",
											{
												type: "button",
												className: "ds-spec-loop-btn",
												disabled: locked || draftEn.trim() === "",
												title: "把左侧英文回译成中文，填入右侧；用来给已有英文条目补一份中文原稿",
												onClick: () => translate("zh"),
											},
											translating === "zh" ? "回译中…" : "回译 →",
										),
									),
									h(
										"div",
										{ className: "ds-spec-loop-pane" },
										h(
											"div",
											{ className: "ds-spec-loop-pane-head" },
											h("span", { className: "ds-spec-loop-pane-tag" }, "中文原稿"),
											h("span", null, "只给你看,不发给模型"),
											h("span", { className: "ds-spec-loop-pane-note" }, draftZh.length + " 字"),
										),
										h("textarea", {
											className: "ds-spec-loop-area",
											value: draftZh,
											spellCheck: false,
											disabled: locked,
											placeholder: "用中文写你想让模型遵守的约束，写完点「← 译到左侧」。",
											onChange: (event) => setDraftZh(event.target.value),
										}),
									),
								),
							),
					),
					h(
						"div",
						{ className: "ds-spec-loop-foot" },
						h("div", { className: "ds-spec-loop-status" + (error !== null ? " is-error" : "") }, status),
						item !== null && item.builtin
							? h(
								"button",
								{
									type: "button",
									className: "ds-spec-loop-btn",
									disabled: locked || !item.customised,
									title: "清空这条的中英文，恢复使用 SKILL.md 原文",
									onClick: () => run({ resetItem: item.id }, (next) => {
										const reset = (next.items || []).find((entry) => entry.id === item.id);
										if (reset) loadDrafts(reset);
									}),
								},
								"恢复默认",
							)
							: null,
						h(
							"button",
							{ type: "button", className: "ds-spec-loop-btn", disabled: locked, onClick: props.onClose },
							"关闭",
						),
						h(
							"button",
							{
								type: "button",
								className: "ds-spec-loop-btn is-primary",
								disabled: locked || !dirty,
								onClick: save,
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
					.catch(() => { if (alive) setState({ enabled: false, items: [], selected: [] }); });
				return () => { alive = false; };
			}, [sessionId]);

			const on = state !== null && state.enabled === true;
			const count = state !== null && state.selected ? state.selected.length : 0;
			const stale = state !== null && (state.items || [])
				.some((entry) => entry.stale && (state.selected || []).indexOf(entry.id) !== -1);

			const toggle = () => {
				if (busy || state === null) return;
				setBusy(true);
				callApi(sessionId, { enabled: !on })
					.then((next) => setState(next))
					.catch((error) => { console.error("dsh-spec-loop: toggle failed", error); })
					.finally(() => setBusy(false));
			};

			return h(
				"div",
				{ className: "ds-spec-loop-wrap" },
				h(
					"button",
					{
						type: "button",
						className: "ds-spec-loop-toggle" + (on ? " is-on" : ""),
						title: on
							? "谨慎模式已开启：已勾选 " + count + " 个条目注入本会话，点击关闭"
							: "开启谨慎模式：注入上次勾选的条目",
						"aria-pressed": on,
						disabled: state === null || busy,
						onClick: toggle,
					},
					h("span", { className: "ds-spec-loop-dot" }),
					"谨慎模式",
					on && count > 1 ? h("span", { className: "ds-spec-loop-count" }, count) : null,
					stale ? h("span", { className: "ds-spec-loop-warn", title: "有已勾选条目的中文改过但没重新翻译" }, "!") : null,
				),
				h(
					"button",
					{
						type: "button",
						className: "ds-spec-loop-edit",
						title: "管理注入内容",
						"aria-label": "管理注入内容",
						disabled: state === null,
						onClick: () => setOpen(true),
					},
					"✎",
				),
				open && state !== null
					? h(ManagerPanel, {
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
