"use client";

const STEPS = [
  { label: "Parsing repository URL…", icon: "🔗" },
  { label: "Fetching metadata from GitHub…", icon: "📡" },
  { label: "Walking file tree…", icon: "🌳" },
  { label: "Reading source files…", icon: "📄" },
  { label: "Chunking code by module…", icon: "🧩" },
  { label: "Analyzing modules with Gemini…", icon: "🤖" },
  { label: "Cross-module reasoning…", icon: "🔄" },
  { label: "Synthesizing final documentation…", icon: "📝" },
];

interface LoadingStateProps {
  step?: string;
}

export default function LoadingState({ step }: LoadingStateProps) {
  const currentIdx = STEPS.findIndex((s) => s.label === step);

  return (
    <div className="w-full max-w-lg flex flex-col items-center gap-8 py-12">
      {/* Animated orb */}
      <div className="relative w-20 h-20">
        <div className="absolute inset-0 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 opacity-20 animate-ping" />
        <div className="absolute inset-2 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 opacity-30 animate-pulse" />
        <div className="absolute inset-0 rounded-full border-2 border-indigo-500/30" />
        <div className="absolute inset-0 rounded-full border-2 border-t-indigo-400 animate-spin" />
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-2xl">{currentIdx >= 0 ? STEPS[currentIdx].icon : "🔍"}</span>
        </div>
      </div>

      {/* Current step label */}
      <div className="text-center">
        <p className="text-gray-200 text-sm font-medium min-h-[1.5rem]">
          {step ?? "Initializing…"}
        </p>
        <p className="text-gray-600 text-xs mt-1">This may take 20–60 seconds for large repos</p>
      </div>

      {/* Step progress */}
      <div className="w-full space-y-1.5">
        {STEPS.map((s, i) => {
          const isDone = currentIdx > i;
          const isCurrent = currentIdx === i;
          return (
            <div
              key={s.label}
              className={`flex items-center gap-3 px-4 py-2 rounded-lg text-xs transition-all duration-300 ${
                isCurrent
                  ? "bg-indigo-500/10 border border-indigo-500/20"
                  : isDone
                  ? "opacity-50"
                  : "opacity-30"
              }`}
            >
              <span className="w-5 text-center">
                {isDone ? (
                  <svg className="w-3.5 h-3.5 text-emerald-400 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : isCurrent ? (
                  <span className="inline-block w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
                ) : (
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-gray-600" />
                )}
              </span>
              <span
                className={
                  isDone
                    ? "text-gray-500 line-through"
                    : isCurrent
                    ? "text-gray-200 font-medium"
                    : "text-gray-600"
                }
              >
                {s.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
