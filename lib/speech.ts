/** 使用浏览器 SpeechSynthesis 朗读英文单词（最终兜底，仅网络彻底失败时使用） */
export function speak(text: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "en-US";
  utterance.rate = 0.9;
  window.speechSynthesis.speak(utterance);
}

/** 当前正在播放的音频实例（用于防重叠） */
let currentAudio: HTMLAudioElement | null = null;

function youdaoUrl(word: string) {
  return `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(word)}&type=2`;
}

/**
 * 播放在线真人发音（有道词典接口，type=2 美音）。
 * 带空格的词组加载失败时，自动去空格重试一次；
 * 仍失败才降级为 SpeechSynthesis 机器音。
 */
export function playAudio(word: string) {
  if (typeof window === "undefined") return;
  // 防重叠：停掉上一次没播完的音频和残留的机器音
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
    currentAudio = null;
  }
  window.speechSynthesis?.cancel();

  const tryPlay = (w: string, isRetry: boolean) => {
    const audio = new Audio(youdaoUrl(w));
    currentAudio = audio;
    audio.onerror = () => {
      if (currentAudio === audio) currentAudio = null;
      if (!isRetry && w.includes(" ")) {
        // 词组（如 according to）有道可能报错，去空格重试
        tryPlay(w.replace(/\s+/g, ""), true);
      } else {
        // 网络彻底失败，才降级机器音
        speak(word);
      }
    };
    audio.play().catch(() => {
      // 浏览器自动播放策略拒绝播放：不触发机器音兜底，静默忽略
    });
  };

  tryPlay(word, false);
}
