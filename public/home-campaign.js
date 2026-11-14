// User-approved final cut. The matching-hands scene is intentionally omitted.
export const campaignFilm = Object.freeze({
  src: '/assets/heirloom-verse-campaign.mp4',
  poster: '/assets/campaign-unwrapping.png',
});

export function campaignSection() {
  const media = campaignFilm.src
    ? `<video class="campaign-media" id="campaign-film" poster="${campaignFilm.poster}" muted loop playsinline preload="none" aria-label="The Heirloom Verse campaign: boutique gifting, ribbon unwrapping, pearl earrings and necklace gifting"></video>`
    : `<img class="campaign-media" src="${campaignFilm.poster}" alt="A woman beginning to untie a burgundy ribbon around an ivory HV jewellery gift box" width="1672" height="941" decoding="async">`;
  return `<section class="campaign-section" aria-labelledby="campaign-title">
    ${media}
    <div class="campaign-copy"><p class="eyebrow">A MOMENT TO TREASURE</p><h2 id="campaign-title">Some things say everything.</h2>${campaignFilm.src ? '' : '<a class="campaign-link" href="#/shop">Find your meaningful piece <span aria-hidden="true">↗</span></a>'}</div>
    ${campaignFilm.src ? '<div class="campaign-controls"><button type="button" data-film-play aria-controls="campaign-film" aria-label="Play campaign film">Play film</button><button type="button" data-film-sound aria-controls="campaign-film" aria-label="Unmute campaign film" aria-pressed="false">Sound off</button></div><p class="sr-only" data-film-status role="status"></p>' : ''}
  </section>`;
}

export function initializeCampaign(root) {
  const video = root.querySelector('#campaign-film');
  if (!video || !campaignFilm.src) return () => {};
  video.src = campaignFilm.src;
  video.muted = true;
  const playButton = root.querySelector('[data-film-play]');
  const soundButton = root.querySelector('[data-film-sound]');
  const status = root.querySelector('[data-film-status]');
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  let manuallyPaused = false;
  let visible = false;
  let failed = false;
  let disposed = false;
  const update = () => {
    playButton.textContent = video.paused ? 'Play film' : 'Pause film';
    playButton.setAttribute('aria-label', video.paused ? 'Play campaign film' : 'Pause campaign film');
  };
  const play = async () => {
    if (disposed || failed) return;
    try { await video.play(); } catch { /* Autoplay may require a deliberate tap. */ }
    if (disposed) video.pause();
    update();
  };
  const sync = () => {
    if (!visible || document.hidden || motion.matches || manuallyPaused) video.pause();
    else void play();
  };
  const togglePlay = () => {
    if (video.paused) { manuallyPaused = false; void play(); }
    else { manuallyPaused = true; video.pause(); }
  };
  const toggleSound = () => {
    video.muted = !video.muted;
    soundButton.textContent = video.muted ? 'Sound off' : 'Sound on';
    soundButton.setAttribute('aria-pressed', String(!video.muted));
    soundButton.setAttribute('aria-label', video.muted ? 'Unmute campaign film' : 'Mute campaign film');
  };
  const onError = () => {
    failed = true;
    video.pause();
    video.hidden = true;
    const poster = document.createElement('img');
    poster.className = 'campaign-media';
    poster.src = campaignFilm.poster;
    poster.alt = 'Ivory HV jewellery gift box tied with burgundy ribbon';
    video.after(poster);
    playButton.hidden = true;
    soundButton.hidden = true;
    status.textContent = 'The film is unavailable. Please enjoy our campaign photograph.';
  };
  video.addEventListener('play', update);
  video.addEventListener('pause', update);
  video.addEventListener('error', onError);
  playButton.addEventListener('click', togglePlay);
  soundButton.addEventListener('click', toggleSound);
  document.addEventListener('visibilitychange', sync);
  motion.addEventListener('change', sync);
  const observer = new IntersectionObserver(entries => {
    visible = entries[0].isIntersecting;
    sync();
  }, { threshold: 0.35 });
  observer.observe(video);
  return () => {
    disposed = true;
    observer.disconnect();
    document.removeEventListener('visibilitychange', sync);
    motion.removeEventListener('change', sync);
    video.removeEventListener('play', update);
    video.removeEventListener('pause', update);
    video.removeEventListener('error', onError);
    playButton.removeEventListener('click', togglePlay);
    soundButton.removeEventListener('click', toggleSound);
    video.pause();
    video.removeAttribute('src');
    video.load();
  };
}
