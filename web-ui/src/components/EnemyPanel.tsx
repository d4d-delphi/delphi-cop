'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { TimelineEvent, ScenarioPhase, InferenceResult } from '@/types';

interface EnemyPanelProps {
  events: TimelineEvent[];
  phases: ScenarioPhase[];
  currentTime: number;
  inferenceResult: InferenceResult | null;
}

// ── 발사 시퀀스 단계별 위험 색상 ──────────────────────────────
// 도달한 단계는 참조 발사확률에 따라 노랑→주황→빨강으로 고조되고,
// 미도달(예정) 단계는 회색 윤곽으로 남는다.
type Risk = {
  dot: string;
  ring: string;
  line: string;
  name: string;
  badge: string;
  prob: string;
};

const REACHED: Record<'yellow' | 'amber' | 'orange' | 'red', Risk> = {
  yellow: {
    dot: 'bg-yellow-400 border-yellow-300',
    ring: 'shadow-[0_0_10px_rgba(250,204,21,0.55)]',
    line: 'bg-yellow-500/40',
    name: 'text-yellow-200',
    badge: 'text-yellow-300/90 border-yellow-700/50 bg-yellow-950/30',
    prob: 'text-yellow-300',
  },
  amber: {
    dot: 'bg-amber-400 border-amber-300',
    ring: 'shadow-[0_0_10px_rgba(251,191,36,0.55)]',
    line: 'bg-amber-500/40',
    name: 'text-amber-200',
    badge: 'text-amber-300/90 border-amber-700/50 bg-amber-950/30',
    prob: 'text-amber-300',
  },
  orange: {
    dot: 'bg-orange-500 border-orange-400',
    ring: 'shadow-[0_0_10px_rgba(249,115,22,0.6)]',
    line: 'bg-orange-500/40',
    name: 'text-orange-200',
    badge: 'text-orange-300/90 border-orange-700/50 bg-orange-950/30',
    prob: 'text-orange-300',
  },
  red: {
    dot: 'bg-red-500 border-red-400',
    ring: 'shadow-[0_0_12px_rgba(239,68,68,0.7)]',
    line: 'bg-red-500/50',
    name: 'text-red-200',
    badge: 'text-red-300 border-red-700/50 bg-red-950/40',
    prob: 'text-red-300',
  },
};

const FUTURE: Risk = {
  dot: 'bg-transparent border-gray-600',
  ring: '',
  line: 'bg-gray-800',
  name: 'text-gray-500',
  badge: 'text-gray-600 border-gray-700/50 bg-transparent',
  prob: 'text-gray-600',
};

function riskFor(prob: number | null, isLaunch: boolean): Risk {
  if (isLaunch || (prob ?? 0) >= 90) return REACHED.red;
  if ((prob ?? 0) >= 60) return REACHED.orange;
  if ((prob ?? 0) >= 40) return REACHED.amber;
  return REACHED.yellow;
}

// "Pre-Phase (D-90~D-30): ..." → "D-90~D-30" / "H-0/Phase 5" → "H-0"
function phaseDday(description: string): string | null {
  const m = description.match(/([DH][+\-]\d+(?:\s*~\s*[DH]?[+\-]?\d+)?)/);
  return m ? m[1].replace(/\s+/g, '') : null;
}
// 참조 발사확률 (과거 유사사례 기준) — 설명에 박힌 "30%" 등
function phaseProb(description: string): number | null {
  const m = description.match(/(\d+)\s*%/);
  return m ? parseInt(m[1], 10) : null;
}
// "Pre-Phase (D-90~D-30): 잠진 액체엔진..." → "잠진 액체엔진..."
function phaseDetail(description: string): string {
  const idx = description.indexOf(':');
  return idx >= 0 ? description.slice(idx + 1).trim() : description;
}

export default function EnemyPanel({ events, phases, currentTime, inferenceResult }: EnemyPanelProps) {
  const top = inferenceResult?.topHypothesis ?? null;
  const likelihoodPct = top ? Math.round(top.posterior * 100) : 0;
  const confidencePct = inferenceResult ? Math.round(inferenceResult.overallConfidence * 100) : 0;

  // 단계별 파생 데이터 (이벤트 배치·도달여부·발사단계 판정)
  const stages = useMemo(() => {
    return phases.map((phase) => {
      const inWindow = events.filter(
        (e) => e.timestamp >= phase.startTime && e.timestamp < phase.endTime,
      );
      const collected = inWindow.filter((e) => e.timestamp <= currentTime);
      const isLaunch = inWindow.some((e) => e.type === 'launch' || e.type === 'strike');
      const reached = currentTime >= phase.startTime;
      const active = reached && currentTime < phase.endTime;
      const completed = currentTime >= phase.endTime;
      return {
        phase,
        inWindow,
        collected,
        isLaunch,
        reached,
        active,
        completed,
        dday: phaseDday(phase.description),
        prob: phaseProb(phase.description),
        detail: phaseDetail(phase.description),
      };
    });
  }, [phases, events, currentTime]);

  const activeId = stages.find((s) => s.active)?.phase.id ?? null;
  const launchReached = stages.some((s) => s.isLaunch && s.reached);

  // 펼침 상태: 기본은 현재 진행 중인 단계를 따라간다(재생 시 자동 이동).
  // 사용자가 다른 단계를 클릭하면 그 단계로 고정된다.
  const [expandedId, setExpandedId] = useState<number | null>(activeId);
  const prevActive = useRef<number | null>(activeId);
  useEffect(() => {
    if (activeId !== prevActive.current) {
      prevActive.current = activeId;
      setExpandedId(activeId);
    }
  }, [activeId]);

  return (
    <div className="h-full flex flex-col bg-[#0d1117] border-r border-amber-900/30">
      {/* Header */}
      <div className="p-3 border-b border-amber-900/30 bg-amber-950/20 shrink-0">
        <h2 className="text-sm font-bold text-amber-400 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
          발사 준비 단계 (LAUNCH SEQUENCE)
        </h2>
      </div>

      {/* Compact live gauge — 실시간 발사 가능성 */}
      <div className="px-3 pt-3 shrink-0">
        <div className="flex items-baseline justify-between mb-1">
          <span className="text-[10px] text-gray-500 uppercase tracking-wider">발사 가능성</span>
          <span className="text-[9px] text-gray-600">신뢰도 {confidencePct}%</span>
        </div>
        <div className="flex items-end gap-2">
          <span className={`text-3xl font-bold leading-none ${gaugeText(likelihoodPct)}`}>
            {likelihoodPct}
            <span className="text-base">%</span>
          </span>
          <div className="flex-1 mb-1">
            <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ${gaugeBar(likelihoodPct)}`}
                style={{ width: `${likelihoodPct}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Vertical stage timeline */}
      <div className="flex-1 px-3 py-3 overflow-y-auto">
        <div className="flex flex-col">
          {stages.map((s, i) => {
            const style = s.reached ? riskFor(s.prob, s.isLaunch && s.reached) : FUTURE;
            const isLast = i === stages.length - 1;
            const isExpanded = expandedId === s.phase.id;
            const canExpand = s.inWindow.length > 0;
            return (
              <div key={s.phase.id} className="flex gap-2.5">
                {/* Rail */}
                <div className="flex flex-col items-center w-3 shrink-0">
                  <div
                    className={`mt-0.5 rounded-full border-2 transition-all ${style.dot} ${
                      s.active ? `w-3.5 h-3.5 ${style.ring} animate-pulse` : 'w-2.5 h-2.5'
                    }`}
                  />
                  {!isLast && (
                    <div className={`w-0.5 flex-1 my-1 rounded-full ${s.completed ? style.line : 'bg-gray-800'}`} />
                  )}
                </div>

                {/* Content */}
                <button
                  type="button"
                  onClick={() => canExpand && setExpandedId(isExpanded ? -1 : s.phase.id)}
                  className={`text-left flex-1 pb-3 group ${canExpand ? 'cursor-pointer' : 'cursor-default'}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-[13px] font-bold leading-tight ${style.name} ${s.active ? 'tracking-wide' : ''}`}>
                      {s.phase.name}
                      {s.active && <span className="ml-1.5 text-[9px] font-normal text-amber-400/80">◀ 현재</span>}
                      {s.isLaunch && s.reached && <span className="ml-1">🚀</span>}
                    </span>
                    {s.dday && (
                      <span className={`shrink-0 text-[9px] font-mono px-1 py-0.5 rounded border ${style.badge}`}>
                        {s.dday}
                      </span>
                    )}
                  </div>

                  <p className={`mt-0.5 text-[10px] leading-snug ${s.reached ? 'text-gray-400' : 'text-gray-600'}`}>
                    {s.detail}
                  </p>

                  <div className="mt-1 flex items-center gap-2 text-[9px]">
                    {s.prob != null && (
                      <span className={`font-mono font-bold ${style.prob}`} title="과거 유사사례 기준 발사확률">
                        {s.prob}%
                      </span>
                    )}
                    {canExpand && (
                      <span className={s.reached ? 'text-gray-500' : 'text-gray-600'}>
                        {s.collected.length > 0
                          ? `첩보 ${s.collected.length}건`
                          : `예정 ${s.inWindow.length}건`}
                      </span>
                    )}
                    {canExpand && (
                      <span className={`ml-auto text-gray-600 transition-transform group-hover:text-gray-400 ${isExpanded ? 'rotate-180' : ''}`}>
                        ▾
                      </span>
                    )}
                  </div>

                  {/* Expanded intel items */}
                  {isExpanded && canExpand && (
                    <div className="mt-1.5 space-y-1 border-l border-gray-700/50 pl-2 animate-fade-in">
                      {s.inWindow.map((e) => {
                        const seen = e.timestamp <= currentTime;
                        return (
                          <div key={e.id} className={`flex items-start gap-1.5 ${seen ? '' : 'opacity-40'}`}>
                            <SourceBadge actionClass={e.actionClass} />
                            <div className="min-w-0">
                              <p className={`text-[10px] leading-tight ${seen ? 'text-gray-300' : 'text-gray-500'}`}>
                                {e.title}
                              </p>
                              <p className="text-[9px] text-gray-600 font-mono">{e.time}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </button>
              </div>
            );
          })}
        </div>

        {/* Breakout hint — 발사 확인 시 Custody 추적으로 전환 예정 */}
        {launchReached && (
          <div className="mt-1 px-2 py-1.5 rounded bg-red-950/40 border border-red-800/50 text-center animate-fade-in">
            <p className="text-[10px] font-bold text-red-300">🚀 발사 확인 · CUSTODY 추적</p>
          </div>
        )}
      </div>
    </div>
  );
}

function gaugeText(pct: number) {
  if (pct >= 75) return 'text-red-400';
  if (pct >= 50) return 'text-orange-400';
  if (pct >= 25) return 'text-yellow-400';
  return 'text-gray-300';
}
function gaugeBar(pct: number) {
  if (pct >= 75) return 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]';
  if (pct >= 50) return 'bg-orange-500';
  if (pct >= 25) return 'bg-yellow-500';
  return 'bg-gray-500';
}

function SourceBadge({ actionClass }: { actionClass?: string }) {
  if (!actionClass) {
    return <span className="shrink-0 w-1.5 h-1.5 mt-1 rounded-full bg-gray-600" />;
  }
  const styles: Record<string, string> = {
    IMINT: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
    SIGINT: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
    MASINT: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
    UAV: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    OSINT: 'bg-pink-500/20 text-pink-400 border-pink-500/30',
    HUMINT: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  };
  return (
    <span
      className={`shrink-0 text-[8px] px-1 py-0.5 rounded border font-mono ${
        styles[actionClass] || 'bg-gray-500/20 text-gray-400 border-gray-500/30'
      }`}
    >
      {actionClass}
    </span>
  );
}
