// Stohill Properties - API Service Layer
import axios from 'axios'
import { useAuthStore } from '@/stores/authStore'

// Same-origin by default: Vite proxies /api in dev and nginx does in prod.
// Override with VITE_API_BASE_URL only if the API lives on another origin.
const BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1/'

// Endpoints that must never trigger the refresh-and-retry flow. A 401 from
// login means "wrong password", not "expired token".
const AUTH_ENDPOINTS = ['auth/login/', 'auth/refresh/']

// The refresh token is an httpOnly cookie set by the API (never readable here);
// the access token lives only in memory. X-Requested-With marks requests as
// coming from our own scripts, which the API requires before using the cookie.
const XHR_HEADERS = { 'X-Requested-With': 'XMLHttpRequest' }

const api = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json', ...XHR_HEADERS },
  timeout: 30000,
  withCredentials: true,
})

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Single-flight refresh: when several requests hit 401 at once they all await
// the same refresh call. Without this, parallel refreshes would each send the
// same refresh token, and with rotation + blacklisting all but the first fail.
let refreshPromise = null

function refreshAccessToken() {
  if (!refreshPromise) {
    refreshPromise = axios
      .post(`${BASE_URL}auth/refresh/`, {}, { withCredentials: true, headers: XHR_HEADERS })
      .then(({ data }) => {
        // The API rotates the refresh cookie itself; keep the new access token in memory.
        useAuthStore.getState().setAccessToken(data.access)
        return data.access
      })
      .finally(() => {
        refreshPromise = null
      })
  }
  return refreshPromise
}

function forceLogout() {
  useAuthStore.getState().logout()
  if (window.location.pathname !== '/login') window.location.assign('/login')
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config
    const isAuthCall = AUTH_ENDPOINTS.some((path) => originalRequest?.url?.endsWith(path))

    if (error.response?.status === 401 && !originalRequest._retry && !isAuthCall) {
      originalRequest._retry = true
      if (!useAuthStore.getState().isAuthenticated) {
        forceLogout()
        return Promise.reject(error)
      }
      try {
        const access = await refreshAccessToken()
        originalRequest.headers.Authorization = `Bearer ${access}`
        return api(originalRequest)
      } catch (refreshError) {
        forceLogout()
        return Promise.reject(refreshError)
      }
    }
    return Promise.reject(error)
  }
)

export const authAPI = {
  login: (email, password) => api.post('auth/login/', { email, password }),
  // Revokes the refresh cookie server-side and clears it.
  logout: () => api.post('auth/logout/', {}),
  me: () => api.get('core/me/'),
  updateMe: (data) => api.patch('core/me/', data),
  portalActivate: (data) => api.post('auth/portal-activate/', data),
  currencies: {
    list: (params) => api.get('core/currencies/', { params }),
  },
}

export const companyAPI = {
  profile: () => api.get('core/company/'),
}

export const propertiesAPI = {
  list: (params) => api.get('properties/', { params }),
  detail: (id) => api.get(`properties/${id}/`),
  create: (data) => api.post('properties/', data),
  update: (id, data) => api.patch(`properties/${id}/`, data),
  delete: (id) => api.delete(`properties/${id}/`),
  mapData: (params) => api.get('properties/map_data/', { params }),
  stats: () => api.get('properties/stats/'),
  listTypes: () => api.get('properties/types/'),
  units: {
    list: (params) => api.get('properties/units/', { params }),
    detail: (id) => api.get(`properties/units/${id}/`),
    create: (data) => api.post('properties/units/', data),
    update: (id, data) => api.patch(`properties/units/${id}/`, data),
    delete: (id) => api.delete(`properties/units/${id}/`),
  },
  images: {
    list: (params) => api.get('properties/images/', { params }),
    detail: (id) => api.get(`properties/images/${id}/`),
    create: (data) => api.post('properties/images/', data),
    update: (id, data) => api.patch(`properties/images/${id}/`, data),
    delete: (id) => api.delete(`properties/images/${id}/`),
    upload: (formData) => api.post('properties/images/', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  },
  valuations: {
    list: (params) => api.get('properties/valuations/', { params }),
    detail: (id) => api.get(`properties/valuations/${id}/`),
    create: (data) => api.post('properties/valuations/', data),
    update: (id, data) => api.patch(`properties/valuations/${id}/`, data),
    delete: (id) => api.delete(`properties/valuations/${id}/`),
  },
  inspections: {
    list: (params) => api.get('properties/inspections/', { params }),
    detail: (id) => api.get(`properties/inspections/${id}/`),
    create: (data) => api.post('properties/inspections/', data),
    update: (id, data) => api.patch(`properties/inspections/${id}/`, data),
    delete: (id) => api.delete(`properties/inspections/${id}/`),
    checklist: (id) => api.post(`properties/inspections/${id}/checklist/`),
    complete: (id, data) => api.post(`properties/inspections/${id}/complete/`, data),
    compare: (id) => api.get(`properties/inspections/${id}/compare/`),
    report: (id) => api.get(`properties/inspections/${id}/report/`, { responseType: 'blob' }),
  },
  inspectionItems: {
    list: (params) => api.get('properties/inspection-items/', { params }),
    detail: (id) => api.get(`properties/inspection-items/${id}/`),
    create: (data) => api.post('properties/inspection-items/', data),
    update: (id, data) => api.patch(`properties/inspection-items/${id}/`, data),
    delete: (id) => api.delete(`properties/inspection-items/${id}/`),
    uploadPhoto: (id, formData) => api.patch(`properties/inspection-items/${id}/`, formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  },
  portfolios: {
    list: (params) => api.get('properties/portfolios/', { params }),
    detail: (id) => api.get(`properties/portfolios/${id}/`),
    create: (data) => api.post('properties/portfolios/', data),
    update: (id, data) => api.patch(`properties/portfolios/${id}/`, data),
    delete: (id) => api.delete(`properties/portfolios/${id}/`),
  },
  ownerships: {
    list: (params) => api.get('properties/ownerships/', { params }),
    detail: (id) => api.get(`properties/ownerships/${id}/`),
    create: (data) => api.post('properties/ownerships/', data),
    update: (id, data) => api.patch(`properties/ownerships/${id}/`, data),
    delete: (id) => api.delete(`properties/ownerships/${id}/`),
  },
  customFields: {
    list: (params) => api.get('properties/custom-fields/', { params }),
    detail: (id) => api.get(`properties/custom-fields/${id}/`),
    create: (data) => api.post('properties/custom-fields/', data),
    update: (id, data) => api.patch(`properties/custom-fields/${id}/`, data),
    delete: (id) => api.delete(`properties/custom-fields/${id}/`),
  },
}

export const crmAPI = {
  contacts: {
    list: (params) => api.get('crm/contacts/', { params }),
    detail: (id) => api.get(`crm/contacts/${id}/`),
    create: (data) => api.post('crm/contacts/', data),
    update: (id, data) => api.patch(`crm/contacts/${id}/`, data),
    delete: (id) => api.delete(`crm/contacts/${id}/`),
    duplicateCheck: (params) => api.get('crm/contacts/duplicate_check/', { params }),
    recomputeScore: (id) => api.post(`crm/contacts/${id}/recompute_score/`),
    inviteToPortal: (id, kind = 'tenant') => api.post(`crm/contacts/${id}/invite_to_portal/`, { kind }),
    // KYC documents (ID, proof of residence...), kept on the contact's record.
    documents: {
      list: (contactId) => api.get('crm/contact-documents/', { params: { contact: contactId, page_size: 100 } }),
      create: (contactId, formData) => {
        formData.append('contact', contactId)
        return api.post('crm/contact-documents/', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
      },
      verify: (contactId, docId) => api.post(`crm/contact-documents/${docId}/verify/`),
      delete: (contactId, docId) => api.delete(`crm/contact-documents/${docId}/`),
    },
  },
  opportunities: {
    list: (params) => api.get('crm/opportunities/', { params }),
    kanban: (params) => api.get('crm/opportunities/kanban/', { params }),
    detail: (id) => api.get(`crm/opportunities/${id}/`),
    create: (data) => api.post('crm/opportunities/', data),
    update: (id, data) => api.patch(`crm/opportunities/${id}/`, data),
    delete: (id) => api.delete(`crm/opportunities/${id}/`),
    moveStage: (id, stageId) => api.post(`crm/opportunities/${id}/move_stage/`, { stage_id: stageId }),
    convertToOpportunity: (id, contactId) => api.post(`crm/opportunities/${id}/convert_to_opportunity/`, { contact_id: contactId }),
    markWon: (id) => api.post(`crm/opportunities/${id}/mark_won/`),
    markLost: (id, reasonId, reasonText) => api.post(`crm/opportunities/${id}/mark_lost/`, { reason_id: reasonId, reason_text: reasonText }),
    bulkAction: (data) => api.post('crm/opportunities/bulk_action/', data),
    duplicateCheck: (params) => api.get('crm/opportunities/duplicate_check/', { params }),
  },
  salesTeams: {
    list: (params) => api.get('crm/sales-teams/', { params }),
    create: (data) => api.post('crm/sales-teams/', data),
    update: (id, data) => api.patch(`crm/sales-teams/${id}/`, data),
    delete: (id) => api.delete(`crm/sales-teams/${id}/`),
  },
  pipelines: { 
    list: () => api.get('crm/pipelines/'),
    create: (data) => api.post('crm/pipelines/', data),
    update: (id, data) => api.patch(`crm/pipelines/${id}/`, data),
    delete: (id) => api.delete(`crm/pipelines/${id}/`),
    stages: {
      create: (data) => api.post('crm/pipeline-stages/', data),
      update: (id, data) => api.patch(`crm/pipeline-stages/${id}/`, data),
      delete: (id) => api.delete(`crm/pipeline-stages/${id}/`),
    }
  },
  activities: {
    list: (params) => api.get('crm/activities/', { params }),
    create: (data) => api.post('crm/activities/', data),
    update: (id, data) => api.patch(`crm/activities/${id}/`, data),
    delete: (id) => api.delete(`crm/activities/${id}/`),
    complete: (id) => api.post(`crm/activities/${id}/complete/`),
  },
  tags: {
    list: () => api.get('crm/tags/'),
    create: (data) => api.post('crm/tags/', data),
  },
  notes: {
    list: (params) => api.get('crm/notes/', { params }),
    create: (data) => api.post('crm/notes/', data, data instanceof FormData ? { headers: { 'Content-Type': 'multipart/form-data' } } : undefined),
    delete: (id) => api.delete(`crm/notes/${id}/`),
  },
  lostReasons: {
    list: () => api.get('crm/lost-reasons/'),
    create: (data) => api.post('crm/lost-reasons/', data),
    update: (id, data) => api.patch(`crm/lost-reasons/${id}/`, data),
    delete: (id) => api.delete(`crm/lost-reasons/${id}/`),
  },
  emailTemplates: {
    list: () => api.get('crm/email-templates/'),
    create: (data) => api.post('crm/email-templates/', data),
    update: (id, data) => api.patch(`crm/email-templates/${id}/`, data),
    delete: (id) => api.delete(`crm/email-templates/${id}/`),
  },
  reports: {
    overview: (pipelineId) => api.get('crm/reports/', { params: { type: 'overview', pipeline: pipelineId || undefined } }),
    pipeline: (pipelineId) => api.get('crm/reports/', { params: { type: 'pipeline', pipeline: pipelineId || undefined } }),
    forecast: () => api.get('crm/reports/', { params: { type: 'forecast' } }),
    winLoss: (pipelineId) => api.get('crm/reports/', { params: { type: 'win_loss', pipeline: pipelineId || undefined } }),
    activities: () => api.get('crm/reports/', { params: { type: 'activities' } }),
  },
}

export const salesAPI = {
  list: (params) => api.get('sales/transactions/', { params }),
  detail: (id) => api.get(`sales/transactions/${id}/`),
  create: (data) => api.post('sales/transactions/', data),
  update: (id, data) => api.patch(`sales/transactions/${id}/`, data),
  delete: (id) => api.delete(`sales/transactions/${id}/`),
  postToFinance: (id) => api.post(`sales/transactions/${id}/post_to_finance/`),
  confirmDeal: (id) => api.post(`sales/transactions/${id}/confirm_deal/`),
  stats: () => api.get('sales/transactions/stats/'),
}

export const rentalsAPI = {
  leases: {
    list: (params) => api.get('rentals/leases/', { params }),
    detail: (id) => api.get(`rentals/leases/${id}/`),
    create: (data) => api.post('rentals/leases/', data),
    update: (id, data) => api.patch(`rentals/leases/${id}/`, data),
    delete: (id) => api.delete(`rentals/leases/${id}/`),
    adjustRental: (id, amount) => api.post(`rentals/leases/${id}/adjust_rental/`, { monthly_rental: amount }),
    generateInvoices: (id, asOf) => api.post(`rentals/leases/${id}/generate_invoices/`, { as_of: asOf }),
    recordDeposit: (id, data) => api.post(`rentals/leases/${id}/record_deposit/`, data),
    refundDeposit: (id, data) => api.post(`rentals/leases/${id}/refund_deposit/`, data),
    renew: (id, data) => api.post(`rentals/leases/${id}/renew/`, data),
    terminate: (id, data) => api.post(`rentals/leases/${id}/terminate/`, data),
    sendForSignature: (id) => api.post(`rentals/leases/${id}/send_for_signature/`),
    markSigned: (id, signed = true) => api.post(`rentals/leases/${id}/mark_signed/`, { signed }),
    stats: () => api.get('rentals/leases/stats/'),
  },
  invoices: {
    list: (params) => api.get('rentals/invoices/', { params }),
    detail: (id) => api.get(`rentals/invoices/${id}/`),
    create: (data) => api.post('rentals/invoices/', data),
    update: (id, data) => api.patch(`rentals/invoices/${id}/`, data),
    delete: (id) => api.delete(`rentals/invoices/${id}/`),
    pdf: (id) => api.get(`rentals/invoices/${id}/download_pdf/`, { responseType: 'blob' }),
    export: (format, params) => api.get('rentals/invoices/export/', { params: { ...params, export_format: format }, responseType: 'blob' }),
  },
  payments: {
    list: (params) => api.get('rentals/payments/', { params }),
    create: (data) => api.post('rentals/payments/', data),
  },
  maintenance: {
    list: (params) => api.get('rentals/maintenance/', { params }),
    create: (data) => api.post('rentals/maintenance/', data),
    update: (id, data) => api.patch(`rentals/maintenance/${id}/`, data),
    delete: (id) => api.delete(`rentals/maintenance/${id}/`),
    complete: (id, data) => api.post(`rentals/maintenance/${id}/complete/`, data),
  },
  charges: {
    list: (params) => api.get('rentals/charges/', { params }),
    create: (data) => api.post('rentals/charges/', data),
    update: (id, data) => api.patch(`rentals/charges/${id}/`, data),
    remove: (id) => api.delete(`rentals/charges/${id}/`),
  },
  owners: {
    list: () => api.get('rentals/owners/'),
    statement: (id, params) => api.get(`rentals/owners/${id}/statement/`, { params }),
    statementPdf: (id, params) => api.get(`rentals/owners/${id}/statement/`, { params: { ...params, export_format: 'pdf' }, responseType: 'blob' }),
    payout: (id, data) => api.post(`rentals/owners/${id}/payout/`, data),
  },
}

export const financeAPI = {
  currencies: {
    list: (params) => api.get('finance/currencies/', { params }),
    delete: (id) => api.delete(`finance/currencies/${id}/`),
  },
  accounts: {
    list: (params) => api.get('finance/accounts/', { params }),
    search: (q) => api.get('finance/account-search/', { params: { q } }),
    detail: (id) => api.get(`finance/accounts/${id}/`),
    create: (data) => api.post('finance/accounts/', data),
    update: (id, data) => api.patch(`finance/accounts/${id}/`, data),
    delete: (id) => api.delete(`finance/accounts/${id}/`),
  },
  journals: {
    list: (params) => api.get('finance/journals/', { params }),
  },
  batches: {
    list: (params) => api.get('finance/batches/', { params }),
    detail: (id) => api.get(`finance/batches/${id}/`),
    create: (data) => api.post('finance/batches/', data),
    update: (id, data) => api.patch(`finance/batches/${id}/`, data),
    delete: (id) => api.delete(`finance/batches/${id}/`),
    submit: (id) => api.post(`finance/batches/${id}/submit_for_approval/`),
    approve: (id) => api.post(`finance/batches/${id}/approve/`),
    post: (id) => api.post(`finance/batches/${id}/post_batch/`),
  },
  entries: {
    list: (params) => api.get('finance/entries/', { params }),
    detail: (id) => api.get(`finance/entries/${id}/`),
    create: (data) => api.post('finance/entries/', data),
    update: (id, data) => api.patch(`finance/entries/${id}/`, data),
    delete: (id) => api.delete(`finance/entries/${id}/`),
    post: (id) => api.post(`finance/entries/${id}/post_entry/`),
    reverse: (id, data = {}) => api.post(`finance/entries/${id}/reverse/`, data),
  },
  allocations: {
    ar: (params) => api.get('finance/ar-allocations/', { params }),
    ap: (params) => api.get('finance/ap-allocations/', { params }),
  },
  costCenters: {
    list: (params) => api.get('finance/cost-centers/', { params }),
    create: (data) => api.post('finance/cost-centers/', data),
    update: (id, data) => api.patch(`finance/cost-centers/${id}/`, data),
    delete: (id) => api.delete(`finance/cost-centers/${id}/`),
  },
  recurringJournals: {
    list: (params) => api.get('finance/recurring-journals/', { params }),
    create: (data) => api.post('finance/recurring-journals/', data),
    update: (id, data) => api.patch(`finance/recurring-journals/${id}/`, data),
    remove: (id) => api.delete(`finance/recurring-journals/${id}/`),
    runDue: () => api.post('finance/recurring-journals/run_due/'),
  },
  approvalRules: {
    list: (params) => api.get('finance/approval-rules/', { params }),
    create: (data) => api.post('finance/approval-rules/', data),
    update: (id, data) => api.patch(`finance/approval-rules/${id}/`, data),
    remove: (id) => api.delete(`finance/approval-rules/${id}/`),
  },
  fx: {
    revalue: (asOf) => api.post('finance/fx/revalue/', { as_of: asOf }),
  },
  budgets: {
    list: (params) => api.get('finance/budgets/', { params }),
    create: (data) => api.post('finance/budgets/', data),
    update: (id, data) => api.patch(`finance/budgets/${id}/`, data),
    remove: (id) => api.delete(`finance/budgets/${id}/`),
  },
  fiscalYears: {
    list: (params) => api.get('finance/fiscal-years/', { params }),
    create: (data) => api.post('finance/fiscal-years/', data),
    update: (id, data) => api.patch(`finance/fiscal-years/${id}/`, data),
    delete: (id) => api.delete(`finance/fiscal-years/${id}/`),
    generatePeriods: (id) => api.post(`finance/fiscal-years/${id}/generate_periods/`),
    close: (id) => api.post(`finance/fiscal-years/${id}/close_year/`),
    reopen: (id) => api.post(`finance/fiscal-years/${id}/reopen_year/`),
  },
  periods: {
    list: (params) => api.get('finance/periods/', { params }),
    lock: (id) => api.post(`finance/periods/${id}/lock/`),
    unlock: (id) => api.post(`finance/periods/${id}/unlock/`),
    close: (id) => api.post(`finance/periods/${id}/close/`),
    reopen: (id) => api.post(`finance/periods/${id}/reopen/`),
  },
  exchangeRates: {
    list: (params) => api.get('finance/exchange-rates/', { params }),
    delete: (id) => api.delete(`finance/exchange-rates/${id}/`),
    latest: (currencyId) => api.get('finance/exchange-rates/', { params: { currency: currencyId, ordering: '-effective_date', page_size: 1 } }),
  },
  postingProfiles: {
    list: (params) => api.get('finance/posting-profiles/', { params }),
    detail: (id) => api.get(`finance/posting-profiles/${id}/`),
    create: (data) => api.post('finance/posting-profiles/', data),
    update: (id, data) => api.patch(`finance/posting-profiles/${id}/`, data),
    delete: (id) => api.delete(`finance/posting-profiles/${id}/`),
  },
  reports: {
    trialBalance: (periodId, propertyId) => api.get('finance/reports/trial-balance/', { params: { period_id: periodId, property_id: propertyId } }),
    incomeStatement: (fromDate, toDate, propertyId) =>
      api.get('finance/reports/income-statement/', { params: { from_date: fromDate, to_date: toDate, property_id: propertyId } }),
    balanceSheet: (asAtDate) =>
      api.get('finance/reports/balance-sheet/', { params: { as_at_date: asAtDate } }),
    vatReturn: (fromDate, toDate) =>
      api.get('finance/reports/vat-return/', { params: { from_date: fromDate, to_date: toDate } }),
    arAging: (asAtDate) => api.get('finance/reports/ar-aging/', { params: { as_at_date: asAtDate } }),
    apAging: (asAtDate) => api.get('finance/reports/ap-aging/', { params: { as_at_date: asAtDate } }),
    generalLedger: (account, fromDate, toDate) =>
      api.get('finance/reports/general-ledger/', { params: { account, from_date: fromDate, to_date: toDate } }),
    cashFlow: (fromDate, toDate) =>
      api.get('finance/reports/cash-flow/', { params: { from_date: fromDate, to_date: toDate } }),
    budgetVsActual: (fiscalYearId, periodId) =>
      api.get('finance/reports/budget-vs-actual/', { params: { fiscal_year: fiscalYearId || undefined, period: periodId || undefined } }),
    export: (reportId, format, params) => 
      api.get(`finance/reports/export/${reportId}/`, { 
        params: { ...params, export_format: format },
        responseType: 'blob'
      }),
  },
  fixedAssets: {
    categories: {
      list: (params) => api.get('fixed-assets/categories/', { params }),
      create: (data) => api.post('fixed-assets/categories/', data),
      update: (id, data) => api.patch(`fixed-assets/categories/${id}/`, data),
      delete: (id) => api.delete(`fixed-assets/categories/${id}/`),
    },
    assets: {
      list: (params) => api.get('fixed-assets/assets/', { params }),
      detail: (id) => api.get(`fixed-assets/assets/${id}/`),
      create: (data) => api.post('fixed-assets/assets/', data),
      update: (id, data) => api.patch(`fixed-assets/assets/${id}/`, data),
      delete: (id) => api.delete(`fixed-assets/assets/${id}/`),
      runDepreciation: (data) => api.post('fixed-assets/assets/run-depreciation/', data),
      dispose: (id, data) => api.post(`fixed-assets/assets/${id}/dispose/`, data),
    },
    transactions: {
      list: (params) => api.get('fixed-assets/transactions/', { params }),
    },
    books: {
      list: (params) => api.get('fixed-assets/books/', { params }),
      create: (data) => api.post('fixed-assets/books/', data),
      update: (id, data) => api.patch(`fixed-assets/books/${id}/`, data),
      delete: (id) => api.delete(`fixed-assets/books/${id}/`),
    },
    locations: {
      list: (params) => api.get('fixed-assets/locations/', { params }),
      create: (data) => api.post('fixed-assets/locations/', data),
      update: (id, data) => api.patch(`fixed-assets/locations/${id}/`, data),
      delete: (id) => api.delete(`fixed-assets/locations/${id}/`),
    },
  },
  ap: {
    suppliers: {
      list: (params) => api.get('finance/suppliers/', { params }),
      detail: (id) => api.get(`finance/suppliers/${id}/`),
      create: (data) => api.post('finance/suppliers/', data),
      update: (id, data) => api.patch(`finance/suppliers/${id}/`, data),
      delete: (id) => api.delete(`finance/suppliers/${id}/`),
      inviteToPortal: (id) => api.post(`finance/suppliers/${id}/invite_to_portal/`),
      toggleActive: (id) => api.post(`finance/suppliers/${id}/toggle_active/`),
      statementPdf: (id, params) => api.get(`finance/suppliers/${id}/statement/`, { params: { ...params, export_format: 'pdf' }, responseType: 'blob' }),
    },
    invoices: {
      list: (params) => api.get('finance/supplier-invoices/', { params }),
      detail: (id) => api.get(`finance/supplier-invoices/${id}/`),
      create: (data) => api.post('finance/supplier-invoices/', data),
      update: (id, data) => api.patch(`finance/supplier-invoices/${id}/`, data),
      delete: (id) => api.delete(`finance/supplier-invoices/${id}/`),
      review: (id) => api.post(`finance/supplier-invoices/${id}/review_invoice/`),
      post: (id) => api.post(`finance/supplier-invoices/${id}/post_invoice/`),
      approvalStatus: (id) => api.get(`finance/supplier-invoices/${id}/approval_status/`),
      approve: (id, comment) => api.post(`finance/supplier-invoices/${id}/approve/`, { comment }),
      reject: (id, comment) => api.post(`finance/supplier-invoices/${id}/reject/`, { comment }),
      matchStatus: (id) => api.get(`finance/supplier-invoices/${id}/match_status/`),
      overrideMatch: (id, reason) => api.post(`finance/supplier-invoices/${id}/override_match/`, { reason }),
      applyCredit: (id, allocations) => api.post(`finance/supplier-invoices/${id}/apply_credit/`, { allocations }),
      writeOff: (id, data) => api.post(`finance/supplier-invoices/${id}/write_off/`, data),
      refund: (id, data) => api.post(`finance/supplier-invoices/${id}/refund/`, data),
    },
    payments: {
      list: (params) => api.get('finance/supplier-payments/', { params }),
      detail: (id) => api.get(`finance/supplier-payments/${id}/`),
      create: (data) => api.post('finance/supplier-payments/', data),
delete: (id) => api.delete(`finance/supplier-payments/${id}/`),
      post: (id) => api.post(`finance/supplier-payments/${id}/post_payment/`),
      approvalStatus: (id) => api.get(`finance/supplier-payments/${id}/approval_status/`),
      approve: (id, comment) => api.post(`finance/supplier-payments/${id}/approve/`, { comment }),
      reject: (id, comment) => api.post(`finance/supplier-payments/${id}/reject/`, { comment }),
      allocate: (id, allocations) => api.post(`finance/supplier-payments/${id}/allocate/`, { allocations }),
      refund: (id, data) => api.post(`finance/supplier-payments/${id}/refund/`, data),
    }
  },
  ar: {
    customers: {
      list: (params) => api.get('finance/customers/', { params }),
      detail: (id) => api.get(`finance/customers/${id}/`),
      create: (data) => api.post('finance/customers/', data),
      update: (id, data) => api.patch(`finance/customers/${id}/`, data),
      delete: (id) => api.delete(`finance/customers/${id}/`),
      statement: (id, params) => api.get(`finance/customers/${id}/statement/`, { params }),
      statementPdf: (id, params) => api.get(`finance/customers/${id}/statement/`, { params: { ...params, export_format: 'pdf' }, responseType: 'blob' }),
      emailStatement: (id, data) => api.post(`finance/customers/${id}/email_statement/`, data),
    },
    invoices: {
      list: (params) => api.get('finance/customer-invoices/', { params }),
      detail: (id) => api.get(`finance/customer-invoices/${id}/`),
      create: (data) => api.post('finance/customer-invoices/', data),
      update: (id, data) => api.patch(`finance/customer-invoices/${id}/`, data),
      delete: (id) => api.delete(`finance/customer-invoices/${id}/`),
      post: (id) => api.post(`finance/customer-invoices/${id}/post_invoice/`),
      email: (id) => api.post(`finance/customer-invoices/${id}/email_invoice/`),
      pdf: (id) => api.get(`finance/customer-invoices/${id}/pdf/`, { responseType: 'blob' }),
      applyCredit: (id, allocations) => api.post(`finance/customer-invoices/${id}/apply_credit/`, { allocations }),
      writeOff: (id, data) => api.post(`finance/customer-invoices/${id}/write_off/`, data),
      refund: (id, data) => api.post(`finance/customer-invoices/${id}/refund/`, data),
    },
    receipts: {
      list: (params) => api.get('finance/customer-receipts/', { params }),
      detail: (id) => api.get(`finance/customer-receipts/${id}/`),
      pdf: (id) => api.get(`finance/customer-receipts/${id}/pdf/`, { responseType: 'blob' }),
      create: (data) => api.post('finance/customer-receipts/', data),
delete: (id) => api.delete(`finance/customer-receipts/${id}/`),
      post: (id) => api.post(`finance/customer-receipts/${id}/post_receipt/`),
      allocate: (id, allocations) => api.post(`finance/customer-receipts/${id}/allocate/`, { allocations }),
      refund: (id, data) => api.post(`finance/customer-receipts/${id}/refund/`, data),
    }
  },
  bank: {
    accounts: {
      list: (params) => api.get('finance/bank-accounts/', { params }),
    }
  },
  tax: {
    codes: {
      list: (params) => api.get('finance/tax-codes/', { params }),
      detail: (id) => api.get(`finance/tax-codes/${id}/`),
      create: (data) => api.post('finance/tax-codes/', data),
      update: (id, data) => api.patch(`finance/tax-codes/${id}/`, data),
      delete: (id) => api.delete(`finance/tax-codes/${id}/`),
    }
  },
  transactions: {
    list: (params) => api.get('finance/transactions/', { params }),
  },
  summary: () => api.get('finance/summary/'),
}

export const bankingAPI = {
  accounts: {
    list: (params) => api.get('banking/accounts/', { params }),
    detail: (id) => api.get(`banking/accounts/${id}/`),
    create: (data) => api.post('banking/accounts/', data),
    update: (id, data) => api.patch(`banking/accounts/${id}/`, data),
    delete: (id) => api.delete(`banking/accounts/${id}/`),
    stats: (id) => api.get(`banking/accounts/${id}/stats/`),
    unmatchedLedger: (id) => api.get(`banking/accounts/${id}/unmatched_ledger/`),
    reconciliation: (id, asOf) => api.get(`banking/accounts/${id}/reconciliation/`, { params: { as_of: asOf } }),
  },
  statements: {
    list: (params) => api.get('banking/statements/', { params }),
    delete: (id) => api.delete(`banking/statements/${id}/`),
    detail: (id) => api.get(`banking/statements/${id}/`),
    import: (formData) => api.post('banking/statements/import/', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
    auto_match: (id) => api.post(`banking/statements/${id}/auto_match/`),
  },
  lines: {
    list: (params) => api.get('banking/lines/', { params }),
    reconcile: (id, data) => api.post(`banking/lines/${id}/reconcile_manually/`, data),
    unreconcile: (id) => api.post(`banking/lines/${id}/unreconcile/`),
    postAdjustment: (id, data) => api.post(`banking/lines/${id}/post_adjustment/`, data),
  },
  rules: {
    list: (params) => api.get('banking/reconciliation-rules/', { params }),
    create: (data) => api.post('banking/reconciliation-rules/', data),
    update: (id, data) => api.patch(`banking/reconciliation-rules/${id}/`, data),
    delete: (id) => api.delete(`banking/reconciliation-rules/${id}/`),
  }
}

export const fixedAssetsAPI = financeAPI.fixedAssets

export const procurementAPI = {
  orders: {
    list: (params) => api.get('procurement/orders/', { params }),
    detail: (id) => api.get(`procurement/orders/${id}/`),
    create: (data) => api.post('procurement/orders/', data),
    update: (id, data) => api.patch(`procurement/orders/${id}/`, data),
    delete: (id) => api.delete(`procurement/orders/${id}/`),
    approvalStatus: (id) => api.get(`procurement/orders/${id}/approval_status/`),
    approve: (id, comment) => api.post(`procurement/orders/${id}/approve/`, { comment }),
    reject: (id, comment) => api.post(`procurement/orders/${id}/reject/`, { comment }),
    issue: (id) => api.post(`procurement/orders/${id}/issue/`),
    cancel: (id) => api.post(`procurement/orders/${id}/cancel/`),
    receive: (id, data) => api.post(`procurement/orders/${id}/receive/`, data),
    createInvoice: (id, data) => api.post(`procurement/orders/${id}/create_invoice/`, data),
  },
  receipts: {
    list: (params) => api.get('procurement/receipts/', { params }),
  },
}

export const projectsAPI = {
  list: (params) => api.get('projects/', { params }),
  detail: (id) => api.get(`projects/${id}/`),
  create: (data) => api.post('projects/', data),
  update: (id, data) => api.patch(`projects/${id}/`, data),
  delete: (id) => api.delete(`projects/${id}/`),
  costReport: (id) => api.get(`projects/${id}/cost_report/`),
  capitalise: (id, data) => api.post(`projects/${id}/capitalise/`, data),
}

export const propmanAPI = {
  // Default rates for new leases and properties (Property settings > Defaults).
  defaults: {
    get: () => api.get('propman/defaults/'),
    update: (data) => api.patch('propman/defaults/', data),
  },
  tariffs: {
    list: (params) => api.get('propman/tariffs/', { params }),
    detail: (id) => api.get(`propman/tariffs/${id}/`),
    create: (data) => api.post('propman/tariffs/', data),
    update: (id, data) => api.patch(`propman/tariffs/${id}/`, data),
    delete: (id) => api.delete(`propman/tariffs/${id}/`),
  },
  meters: {
    list: (params) => api.get('propman/meters/', { params }),
    detail: (id) => api.get(`propman/meters/${id}/`),
    create: (data) => api.post('propman/meters/', data),
    update: (id, data) => api.patch(`propman/meters/${id}/`, data),
    delete: (id) => api.delete(`propman/meters/${id}/`),
    reconciliation: (id, params) => api.get(`propman/meters/${id}/reconciliation/`, { params }),
  },
  readings: {
    list: (params) => api.get('propman/meter-readings/', { params }),
    detail: (id) => api.get(`propman/meter-readings/${id}/`),
    create: (data) => api.post('propman/meter-readings/', data),
    update: (id, data) => api.patch(`propman/meter-readings/${id}/`, data),
    delete: (id) => api.delete(`propman/meter-readings/${id}/`),
  },
  recoverySchedules: {
    list: (params) => api.get('propman/recovery-schedules/', { params }),
    detail: (id) => api.get(`propman/recovery-schedules/${id}/`),
    create: (data) => api.post('propman/recovery-schedules/', data),
    update: (id, data) => api.patch(`propman/recovery-schedules/${id}/`, data),
    delete: (id) => api.delete(`propman/recovery-schedules/${id}/`),
    preview: (id, params) => api.get(`propman/recovery-schedules/${id}/preview/`, { params }),
    reconcile: (id, data) => api.post(`propman/recovery-schedules/${id}/reconcile/`, data),
  },
  recoveryShares: {
    list: (params) => api.get('propman/recovery-shares/', { params }),
    detail: (id) => api.get(`propman/recovery-shares/${id}/`),
    create: (data) => api.post('propman/recovery-shares/', data),
    update: (id, data) => api.patch(`propman/recovery-shares/${id}/`, data),
    delete: (id) => api.delete(`propman/recovery-shares/${id}/`),
  },
  recoveryReconciliations: { list: (params) => api.get('propman/recovery-reconciliations/', { params }) },
  escalationSteps: {
    list: (params) => api.get('propman/escalation-steps/', { params }),
    detail: (id) => api.get(`propman/escalation-steps/${id}/`),
    create: (data) => api.post('propman/escalation-steps/', data),
    update: (id, data) => api.patch(`propman/escalation-steps/${id}/`, data),
    delete: (id) => api.delete(`propman/escalation-steps/${id}/`),
  },
  cpi: {
    list: (params) => api.get('propman/cpi/', { params }),
    detail: (id) => api.get(`propman/cpi/${id}/`),
    create: (data) => api.post('propman/cpi/', data),
    update: (id, data) => api.patch(`propman/cpi/${id}/`, data),
    delete: (id) => api.delete(`propman/cpi/${id}/`),
  },
  leaseOptions: {
    list: (params) => api.get('propman/lease-options/', { params }),
    detail: (id) => api.get(`propman/lease-options/${id}/`),
    create: (data) => api.post('propman/lease-options/', data),
    update: (id, data) => api.patch(`propman/lease-options/${id}/`, data),
    delete: (id) => api.delete(`propman/lease-options/${id}/`),
    decide: (id, status) => api.post(`propman/lease-options/${id}/decide/`, { status }),
  },
  guarantees: {
    list: (params) => api.get('propman/guarantees/', { params }),
    detail: (id) => api.get(`propman/guarantees/${id}/`),
    create: (data) => api.post('propman/guarantees/', data),
    update: (id, data) => api.patch(`propman/guarantees/${id}/`, data),
    delete: (id) => api.delete(`propman/guarantees/${id}/`),
  },
  turnover: {
    list: (params) => api.get('propman/turnover-reports/', { params }),
    detail: (id) => api.get(`propman/turnover-reports/${id}/`),
    create: (data) => api.post('propman/turnover-reports/', data),
    update: (id, data) => api.patch(`propman/turnover-reports/${id}/`, data),
    delete: (id) => api.delete(`propman/turnover-reports/${id}/`),
  },
  arrearsStages: {
    list: (params) => api.get('propman/arrears-stages/', { params }),
    detail: (id) => api.get(`propman/arrears-stages/${id}/`),
    create: (data) => api.post('propman/arrears-stages/', data),
    update: (id, data) => api.patch(`propman/arrears-stages/${id}/`, data),
    delete: (id) => api.delete(`propman/arrears-stages/${id}/`),
  },
  arrearsCases: {
    list: (params) => api.get('propman/arrears-cases/', { params }),
    detail: (id) => api.get(`propman/arrears-cases/${id}/`),
    update: (id, data) => api.patch(`propman/arrears-cases/${id}/`, data),
    run: () => api.post('propman/arrears-cases/run/'),
    promise: (id, data) => api.post(`propman/arrears-cases/${id}/promise/`, data),
    handover: (id, data) => api.post(`propman/arrears-cases/${id}/handover/`, data),
    note: (id, note) => api.post(`propman/arrears-cases/${id}/note/`, { note }),
    nextStage: (id) => api.post(`propman/arrears-cases/${id}/next_stage/`),
    close: (id, data) => api.post(`propman/arrears-cases/${id}/close/`, data),
  },
  mandates: {
    list: (params) => api.get('propman/debit-mandates/', { params }),
    detail: (id) => api.get(`propman/debit-mandates/${id}/`),
    create: (data) => api.post('propman/debit-mandates/', data),
    update: (id, data) => api.patch(`propman/debit-mandates/${id}/`, data),
    delete: (id) => api.delete(`propman/debit-mandates/${id}/`),
  },
  debitBatches: {
    list: (params) => api.get('propman/debit-batches/', { params }),
    detail: (id) => api.get(`propman/debit-batches/${id}/`),
    create: (data) => api.post('propman/debit-batches/', data),
    delete: (id) => api.delete(`propman/debit-batches/${id}/`),
    file: (id) => api.get(`propman/debit-batches/${id}/file/`, { responseType: 'blob' }),
    results: (id, results) => api.post(`propman/debit-batches/${id}/results/`, { results }),
  },
  depositInterest: { list: (params) => api.get('propman/deposit-interest/', { params }) },
  ownerRuns: {
    list: (params) => api.get('propman/owner-payment-runs/', { params }),
    preview: (params) => api.get('propman/owner-payment-runs/preview/', { params }),
    create: (data) => api.post('propman/owner-payment-runs/', data),
    file: (id) => api.get(`propman/owner-payment-runs/${id}/file/`, { responseType: 'blob' }),
  },
  applications: {
    list: (params) => api.get('propman/applications/', { params }),
    detail: (id) => api.get(`propman/applications/${id}/`),
    create: (data) => api.post('propman/applications/', data),
    update: (id, data) => api.patch(`propman/applications/${id}/`, data),
    delete: (id) => api.delete(`propman/applications/${id}/`),
    creditCheck: (id) => api.post(`propman/applications/${id}/credit_check/`),
    creditResult: (id, data) => api.post(`propman/applications/${id}/credit_result/`, data),
    approve: (id, note) => api.post(`propman/applications/${id}/approve/`, { note }),
    decline: (id, note) => api.post(`propman/applications/${id}/decline/`, { note }),
    convert: (id, data) => api.post(`propman/applications/${id}/convert/`, data),
  },
  quotes: {
    list: (params) => api.get('propman/maintenance-quotes/', { params }),
    detail: (id) => api.get(`propman/maintenance-quotes/${id}/`),
    create: (data) => api.post('propman/maintenance-quotes/', data),
    update: (id, data) => api.patch(`propman/maintenance-quotes/${id}/`, data),
    delete: (id) => api.delete(`propman/maintenance-quotes/${id}/`),
    accept: (id) => api.post(`propman/maintenance-quotes/${id}/accept/`),
    reject: (id, note) => api.post(`propman/maintenance-quotes/${id}/reject/`, { note }),
  },
  plans: {
    list: (params) => api.get('propman/maintenance-plans/', { params }),
    detail: (id) => api.get(`propman/maintenance-plans/${id}/`),
    create: (data) => api.post('propman/maintenance-plans/', data),
    update: (id, data) => api.patch(`propman/maintenance-plans/${id}/`, data),
    delete: (id) => api.delete(`propman/maintenance-plans/${id}/`),
    run: () => api.post('propman/maintenance-plans/run/'),
  },
  reports: {
    run: (key, params) => api.get(`propman/reports/${key}/`, { params }),
    csv: (key, params) => api.get(`propman/reports/${key}/`, { params: { ...params, export_format: 'csv' }, responseType: 'blob' }),
  },
  savedReports: {
    list: (params) => api.get('propman/saved-reports/', { params }),
    detail: (id) => api.get(`propman/saved-reports/${id}/`),
    create: (data) => api.post('propman/saved-reports/', data),
    update: (id, data) => api.patch(`propman/saved-reports/${id}/`, data),
    delete: (id) => api.delete(`propman/saved-reports/${id}/`),
  },
  distribution: {
    invoices: (data) => api.post('propman/distribution/invoices/', data),
    statements: (data) => api.post('propman/distribution/statements/', data),
    message: (data) => api.post('propman/distribution/message/', data),
  },
}

export const notificationsAPI = {
  messages: (params) => api.get('notifications/messages/', { params }),
  // The signed-in user's in-app notifications (the bell in the top bar).
  inbox: (params) => api.get('notifications/inbox/', { params }),
  unreadCount: () => api.get('notifications/inbox/unread-count/'),
  markRead: (id) => api.post(`notifications/inbox/${id}/read/`),
  markAllRead: () => api.post('notifications/inbox/read-all/'),
  remove: (id) => api.delete(`notifications/inbox/${id}/`),
}

export const ownerPortalAPI = {
  me: () => api.get('owner-portal/me/'),
  statement: (params) => api.get('owner-portal/statement/', { params }),
  statementPdf: (params) => api.get('owner-portal/statement/', { params: { ...params, export_format: 'pdf' }, responseType: 'blob' }),
  properties: (params) => api.get('owner-portal/properties/', { params }),
  maintenance: () => api.get('owner-portal/maintenance/'),
  quotes: () => api.get('owner-portal/quotes/'),
  decide: (id, approve, note) => api.post(`owner-portal/quotes/${id}/decide/`, { approve, note }),
}

export const contractorPortalAPI = {
  me: () => api.get('contractor-portal/me/'),
  jobs: (params) => api.get('contractor-portal/jobs/', { params }),
  updateJob: (reference, data) => api.patch(`contractor-portal/jobs/${reference}/`, data),
  reportDone: (reference, notes) => api.post(`contractor-portal/jobs/${reference}/done/`, { notes }),
  quotes: () => api.get('contractor-portal/quotes/'),
  submitQuote: (formData) => api.post('contractor-portal/quotes/', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
}

export const portalAPI = {
  me: () => api.get('portal/me/'),
  invoices: () => api.get('portal/invoices/'),
  invoicePdf: (id) => api.get(`portal/invoices/${id}/pdf/`, { responseType: 'blob' }),
  statement: (params) => api.get('portal/statement/', { params }),
  statementPdf: (params) => api.get('portal/statement/', { params: { ...params, export_format: 'pdf' }, responseType: 'blob' }),
  maintenance: {
    list: () => api.get('portal/maintenance/'),
    create: (data) => api.post('portal/maintenance/', data),
  },
  payments: {
    list: () => api.get('portal/payments/'),
    start: (invoiceIds) => api.post('portal/payments/', { invoices: invoiceIds }),
    detail: (reference) => api.get(`portal/payments/${reference}/`),
    refresh: (reference) => api.post(`portal/payments/${reference}/refresh/`),
    simulate: (reference, outcome) => api.post(`portal/payments/${reference}/simulate/`, { outcome }),
  },
}

export const commissionsAPI = {
  list: (params) => api.get('commissions/records/', { params }),
  detail: (id) => api.get(`commissions/records/${id}/`),
  delete: (id) => api.delete(`commissions/records/${id}/`),
  approve: (id) => api.post(`commissions/records/${id}/approve/`),
  stats: () => api.get('commissions/records/stats/'),
  structures: {
    list: (params) => api.get('commissions/structures/', { params }),
    create: (data) => api.post('commissions/structures/', data),
    update: (id, data) => api.patch(`commissions/structures/${id}/`, data),
    delete: (id) => api.delete(`commissions/structures/${id}/`),
  },
}

export const documentsAPI = {
  list: (params) => api.get('documents/', { params }),
  detail: (id) => api.get(`documents/${id}/`),
  delete: (id) => api.delete(`documents/${id}/`),
  upload: (formData) => api.post('documents/', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  update: (id, data) => api.patch(`documents/${id}/`, data),
  // Document types, each with document_count.
  categories: {
    list: (params) => api.get('documents/categories/', { params }),
    create: (data) => api.post('documents/categories/', data),
    update: (id, data) => api.patch(`documents/categories/${id}/`, data),
    delete: (id) => api.delete(`documents/categories/${id}/`),
  },
  compliance: {
    list: (params) => api.get('documents/compliance/', { params }),
    summary: () => api.get('documents/compliance/summary/'),
  },
}

export const hrAPI = {
  employees: {
    list: (params) => api.get('hr/employees/', { params }),
    detail: (id) => api.get(`hr/employees/${id}/`),
    create: (data) => api.post('hr/employees/', data),
    update: (id, data) => api.patch(`hr/employees/${id}/`, data),
    delete: (id) => api.delete(`hr/employees/${id}/`),
    statement: (id) => api.get(`hr/employees/${id}/statement/`),
  },
  departments: { 
    list: () => api.get('hr/departments/'),
    create: (data) => api.post('hr/departments/', data),
    update: (id, data) => api.patch(`hr/departments/${id}/`, data),
    delete: (id) => api.delete(`hr/departments/${id}/`),
  },
  leave: {
    list: (params) => api.get('hr/leave/', { params }),
    create: (data) => api.post('hr/leave/', data),
    update: (id, data) => api.patch(`hr/leave/${id}/`, data),
    delete: (id) => api.delete(`hr/leave/${id}/`),
  },
  contracts: {
    list: (params) => api.get('hr/contracts/', { params }),
    detail: (id) => api.get(`hr/contracts/${id}/`),
    create: (data) => api.post('hr/contracts/', data),
    update: (id, data) => api.patch(`hr/contracts/${id}/`, data),
    delete: (id) => api.delete(`hr/contracts/${id}/`),
  },
  jobPositions: {
    list: (params) => api.get('hr/job-positions/', { params }),
  },
  attendance: {
    list: (params) => api.get('hr/attendance/', { params }),
    create: (data) => api.post('hr/attendance/', data),
    update: (id, data) => api.patch(`hr/attendance/${id}/`, data),
    delete: (id) => api.delete(`hr/attendance/${id}/`),
  },
  allocations: {
    list: (params) => api.get('hr/allocations/', { params }),
    create: (data) => api.post('hr/allocations/', data),
    update: (id, data) => api.patch(`hr/allocations/${id}/`, data),
    delete: (id) => api.delete(`hr/allocations/${id}/`),
  },
}

export const payrollAPI = {
  runs: {
    list: (params) => api.get('payroll/runs/', { params }),
    detail: (id) => api.get(`payroll/runs/${id}/`),
    create: (data) => api.post('payroll/runs/', data),
    update: (id, data) => api.patch(`payroll/runs/${id}/`, data),
    delete: (id) => api.delete(`payroll/runs/${id}/`),
    process: (id) => api.post(`payroll/runs/${id}/process/`),
    payAll: (id) => api.post(`payroll/runs/${id}/pay_all/`),
    approve: (id) => api.post(`payroll/runs/${id}/approve/`),
    statutory: (id) => api.get(`payroll/runs/${id}/statutory/`),
    bankFile: (id) => api.get(`payroll/runs/${id}/bank_file/`, { responseType: 'blob' }),
    emailPayslips: (id) => api.post(`payroll/runs/${id}/email_payslips/`),
  },
  payslips: {
    list: (params) => api.get('payroll/payslips/', { params }),
    detail: (id) => api.get(`payroll/payslips/${id}/`),
    update: (id, data) => api.patch(`payroll/payslips/${id}/`, data),
    details: (id) => api.get(`payroll/payslips/${id}/details/`),
  },
  salaryRules: {
    list: (params) => api.get('payroll/salary-rules/', { params }),
  },
  salaryStructures: {
    list: (params) => api.get('payroll/salary-structures/', { params }),
  },
  settings: {
    list: (params) => api.get('payroll/settings/', { params }),
    create: (data) => api.post('payroll/settings/', data),
    update: (id, data) => api.patch(`payroll/settings/${id}/`, data),
  },
  taxBrackets: {
    list: (params) => api.get('payroll/tax-brackets/', { params }),
    create: (data) => api.post('payroll/tax-brackets/', data),
    update: (id, data) => api.patch(`payroll/tax-brackets/${id}/`, data),
    delete: (id) => api.delete(`payroll/tax-brackets/${id}/`),
  },
}

export const dashboardAPI = {
  executive: () => api.get('dashboard/executive/'),
  agent: () => api.get('dashboard/agent/'),
}

export const adminAPI = {
  users: {
    list: (params) => api.get('core/users/', { params }),
    detail: (id) => api.get(`core/users/${id}/`),
    create: (data) => api.post('core/users/', data),
    update: (id, data) => api.patch(`core/users/${id}/`, data),
    delete: (id) => api.delete(`core/users/${id}/`),
    setPassword: (id, data) => api.post(`core/users/${id}/set-password/`, data),
    sodConflicts: (id) => api.get(`core/users/${id}/sod_conflicts/`),
  },
  roles: {
    list: (params) => api.get('core/roles/', { params }),
    detail: (id) => api.get(`core/roles/${id}/`),
    create: (data) => api.post('core/roles/', data),
    update: (id, data) => api.patch(`core/roles/${id}/`, data),
    delete: (id) => api.delete(`core/roles/${id}/`),
  },
  modules: {
    list: (params) => api.get('core/modules/', { params }),
  },
  integrations: {
    list: () => api.get('core/integrations/'),
    testEmail: (to) => api.post('core/integrations/test-email/', { to }),
    testSms: (to) => api.post('core/integrations/test-sms/', { to }),
  },
  auditLogs: {
    list: (params) => api.get('core/audit-logs/', { params }),
    models: () => api.get('core/audit-logs/models/'),
  },
  sodRules: {
    list: (params) => api.get('core/sod-rules/', { params }),
    suggestions: () => api.get('core/sod-rules/suggestions/'),
    create: (data) => api.post('core/sod-rules/', data),
    update: (id, data) => api.patch(`core/sod-rules/${id}/`, data),
    delete: (id) => api.delete(`core/sod-rules/${id}/`),
  },
}

export const dataManagementAPI = {
  getTemplate: (module) => api.get(`core/data/template/${module}/`, { responseType: 'blob' }),
  exportData: (module) => api.get(`core/data/export/${module}/`, { responseType: 'blob' }),
  importData: (module, file) => {
    const formData = new FormData()
    formData.append('file', file)
    return api.post(`core/data/import/${module}/`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },
}

// Private files (KYC, contracts, attachments) are only served to an
// authenticated API request, so a plain <a href> can't fetch them: download
// through axios (which adds the bearer token) and save the blob.
export async function fetchPrivateFile(url, fallbackName = 'download') {
  const path = url.replace(/^\/api\/v1\//, '')
  const response = await api.get(path, { responseType: 'blob' })
  const disposition = response.headers?.['content-disposition'] || ''
  const match = /filename\*=UTF-8''([^;]+)/.exec(disposition)
  return { blob: response.data, filename: match ? decodeURIComponent(match[1]) : fallbackName }
}

export async function downloadPrivateFile(url, fallbackName = 'download') {
  const { blob, filename } = await fetchPrivateFile(url, fallbackName)
  const href = window.URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = href
  link.setAttribute('download', filename)
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.URL.revokeObjectURL(href)
}

// Human-readable message from an API error (the backend wraps errors as
// {success:false, error:{message}} where message is a string or field map).
export function apiErrorMessage(error, fallback = 'Something went wrong.') {
  const message = error?.response?.data?.error?.message ?? error?.response?.data?.error
  if (!message) return fallback
  if (typeof message === 'string') return message
  if (message.detail) return [].concat(message.detail).join(' ')
  return Object.entries(message).map(([k, v]) => `${k}: ${[].concat(v).join(' ')}`).join('; ')
}

// Save a blob response (PDF/CSV) under the server's filename.
export function saveBlobResponse(response, fallbackName = 'download') {
  const disposition = response.headers?.['content-disposition'] || ''
  const star = /filename\*=UTF-8''([^;]+)/.exec(disposition)
  const plain = /filename="?([^";]+)"?/.exec(disposition)
  const filename = star ? decodeURIComponent(star[1]) : plain ? plain[1] : fallbackName
  const href = window.URL.createObjectURL(response.data)
  const link = document.createElement('a')
  link.href = href
  link.setAttribute('download', filename)
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.URL.revokeObjectURL(href)
}

export default api

/**
 * Sign the user out: the API revokes the refresh cookie and clears it.
 * Server-side revocation is best-effort: local state is always cleared,
 * even if the network call fails (e.g. the token already expired).
 */
export async function signOut() {
  const { logout } = useAuthStore.getState()
  try {
    await authAPI.logout()
  } catch {
    // Ignore: an expired/invalid token needs no revocation.
  } finally {
    logout()
  }
}
