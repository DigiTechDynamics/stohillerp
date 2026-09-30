// Stohill Properties - Brand logo with a build-safe fallback.
//
// The official logo lives at src/assets/logo.(svg|png|webp). It used to be
// imported directly, but the file was never committed (the root .gitignore
// excluded *.png), so fresh clones failed to build.
//
// import.meta.glob resolves at build time and returns {} when no file matches,
// so the app builds either way: with the real asset it renders the image,
// without it it renders a typographic monogram in the brand colour.

const logoModules = import.meta.glob('../../assets/logo.{svg,png,webp}', {
  eager: true,
  import: 'default',
})
// Prefer vector, then raster formats.
const logoSrc =
  Object.entries(logoModules)
    .sort(([a], [b]) => (a.endsWith('.svg') ? -1 : b.endsWith('.svg') ? 1 : 0))
    .map(([, src]) => src)[0] ?? null

export default function BrandLogo({ className = 'w-8 h-8' }) {
  if (logoSrc) {
    return <img src={logoSrc} alt="Stohill Properties" className={`${className} object-contain`} />
  }
  return (
    <span
      role="img"
      aria-label="Stohill Properties"
      className={`${className} inline-flex items-center justify-center rounded-md bg-primary font-display font-bold text-dark-950 select-none`}
    >
      S
    </span>
  )
}
