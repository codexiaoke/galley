import { useRef, useState } from "react";
import { MousePointer2, Plus, X } from "lucide-react";
import { Field, INPUT, buttonClass } from "../../src/app/admin/ui";
import { Select } from "../../src/app/admin/select";
import type { Beat } from "../../src/core/studio-types";
import { GUIDE_EMPHASIS, guideEmphasisLabel } from "../../src/core/studio-guides";

export function readGuides(form: FormData) {
  const targets = form.getAll("guide-target"), phrases = form.getAll("guide-phrase"), emphasis = form.getAll("guide-emphasis");
  return targets.map((target, i) => ({ targetId: String(target), phrase: String(phrases[i]), emphasis: String(emphasis[i]) }));
}

export function GuideSummary({ beat }: { beat: Beat }) {
  if (!beat.guides?.length) return null;
  return <div className="mt-2 border-l-2 border-a-border pl-2 text-xs text-a-muted">{beat.guides.map((guide, i) => <p key={i} className="mb-1 leading-relaxed"><MousePointer2 size={11} className="mr-1 inline" />「{guide.phrase}」→ {beat.targets?.find((target) => target.id === guide.targetId)?.label}<span className="ml-1">（{guideEmphasisLabel(guide.emphasis).split(" · ")[0]}）</span></p>)}</div>;
}

export function GuideFields({ beat }: { beat: Beat }) {
  const [rows, setRows] = useState(() => (beat.guides ?? []).map((guide, i) => ({ ...guide, key: i })));
  const sequence = useRef(rows.length);
  return <section className="space-y-3 border-t border-a-border pt-4">
    <h3 className="flex items-center gap-2 font-medium"><MousePointer2 size={14} />讲解指向</h3>
    <p className="text-xs leading-relaxed text-a-muted">按讲述顺序选择目标、原话与强调方式。指示用边框标记目标，聚焦弱化周围内容，放大聚焦推近重点。相邻几句尽量保持同一镜头，避免频繁缩放；讲完平缓回到全景。</p>
    {rows.map((row, i) => <div key={row.key} className="space-y-2 border-b border-a-border pb-3">
      <div className="flex items-center justify-between text-xs text-a-muted">指向 {i + 1}<button type="button" className={buttonClass("link")} aria-label={`移除指向 ${i + 1}`} onClick={() => setRows((rows) => rows.filter((item) => item.key !== row.key))}><X size={13} />移除</button></div>
      <Field label="画面目标"><Select name="guide-target" defaultValue={row.targetId} options={[{ value: "", label: "选择当前拍的元素" }, ...(beat.targets ?? []).map((target) => ({ value: target.id, label: target.label }))]} ariaLabel={`指向 ${i + 1} 的画面目标`} /></Field>
      <Field label="强调方式"><Select name="guide-emphasis" defaultValue={row.emphasis ?? "focus"} options={[...GUIDE_EMPHASIS]} ariaLabel={`指向 ${i + 1} 的强调方式`} /></Field>
      <Field label="讲到这段原话时"><textarea name="guide-phrase" className={INPUT} defaultValue={row.phrase} rows={2} maxLength={2000} required placeholder="从本拍讲稿复制一句话或一段连续原话" /></Field>
    </div>)}
    {beat.targets?.length ? <button type="button" disabled={rows.length >= 12} className={buttonClass("link")} onClick={() => setRows((rows) => [...rows, { key: sequence.current++, targetId: "", phrase: "" }])}><Plus size={13} />添加指向</button> : <p className="text-xs text-a-muted">这一拍没有可指向的元素。旧项目请先同步来源文章，更新目标清单。</p>}
  </section>;
}
