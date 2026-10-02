// External logins (tenants, owners, contractors) only have portal modules;
// staff never land in a portal.
const PORTALS = [
  { module: 'portal', kind: 'tenant', path: '/portal' },
  { module: 'owner_portal', kind: 'owner', path: '/owner' },
  { module: 'contractor_portal', kind: 'contractor', path: '/contractor' },
]
const PORTAL_MODULES = PORTALS.map((p) => p.module)

const modulesOf = (user) => (Array.isArray(user?.accessible_modules) ? user.accessible_modules : [])

export const isPortalUser = (user) => {
  const modules = modulesOf(user)
  return modules.length > 0 && modules.every((m) => PORTAL_MODULES.includes(m))
}

// The portals this login can open, e.g. a tenant who is also an owner gets both.
export const portalsFor = (user) => {
  const modules = modulesOf(user)
  return PORTALS.filter((p) => modules.includes(p.module))
}

export const hasPortal = (user, kind) => portalsFor(user).some((p) => p.kind === kind)

export const homePathFor = (user) => (isPortalUser(user) ? portalsFor(user)[0].path : '/dashboard')
