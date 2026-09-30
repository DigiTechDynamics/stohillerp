// A tenant login only has the portal module; staff never land in the portal.
export const isPortalUser = (user) =>
  Array.isArray(user?.accessible_modules) &&
  user.accessible_modules.length === 1 &&
  user.accessible_modules[0] === 'portal'

export const homePathFor = (user) => (isPortalUser(user) ? '/portal' : '/dashboard')
