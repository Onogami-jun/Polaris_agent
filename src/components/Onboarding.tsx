import React, { useState } from 'react';
import { Button } from './ui/button';

export const ONBOARDING_KEY = 'polaris_onboarding_done';

interface OnboardingProps {
  onDone: () => void;
}

export const Onboarding: React.FC<OnboardingProps> = ({ onDone }) => {
  const [step, setStep] = useState(0);

  const slides = [
    {
      title: '欢迎使用 Polaris Solver',
      desc: 'BitWool Studio 出品的运筹优化科研助手。\n用自然语言描述优化问题，自动建模并求解。',
      icon: <div className="text-5xl mb-4">✦</div>,
    },
    {
      title: '智能路由引擎',
      desc: '内置 LLM 意图分类器，自动判断你是要讨论算法、求解问题、还是跑实验。\n不需要手动切换模式。',
      icon: <div className="text-5xl mb-4">🧠</div>,
    },
    {
      title: 'Python 沙箱',
      desc: '首次启动自动安装便携 Python 环境。\n无需手动配置，polairs-opt 引擎直接可用。',
      icon: <div className="text-5xl mb-4">🐍</div>,
    },
    {
      title: 'BitWool 账号',
      desc: '注册 BitWool 账号后解锁全部功能。\n同一账号可在启文 QiWen Writer 中登录使用。',
      icon: <div className="text-5xl mb-4">🔐</div>,
    },
    {
      title: '本地推理模型',
      desc: 'Polaris 内置轻量推理模型，一键安装。\n安装后常见优化问题离线求解，零 API 费用。',
      icon: <div className="text-5xl mb-4">🧠</div>,
    },
  ];

  const slide = slides[step];
  const isLast = step === slides.length - 1;

  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center bg-background animate-fade-in">
      <div className="w-[420px] max-w-[92vw] text-center space-y-6">
        {slide.icon}
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">{slide.title}</h2>
        <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">{slide.desc}</p>

        {/* Dots */}
        <div className="flex gap-2 justify-center">
          {slides.map((_, i) => (
            <div key={i} className={'w-2 h-2 rounded-full transition-all ' + (i === step ? 'bg-primary w-6' : 'bg-muted-foreground/25')} />
          ))}
        </div>

        <div className="flex gap-3 justify-center pt-4">
          {step > 0 && (
            <Button variant="outline" onClick={() => setStep(step - 1)} className="h-9 px-6">上一步</Button>
          )}
          <Button onClick={() => {
            if (isLast) { localStorage.setItem(ONBOARDING_KEY, '1'); onDone(); }
            else setStep(step + 1);
          }} className="h-9 px-6">
            {isLast ? '开始使用' : '下一步'}
          </Button>
          {!isLast && (
            <button className="text-xs text-muted-foreground hover:text-foreground px-2" onClick={() => { localStorage.setItem(ONBOARDING_KEY, '1'); onDone(); }}>跳过</button>
          )}
        </div>
      </div>
    </div>
  );
};
