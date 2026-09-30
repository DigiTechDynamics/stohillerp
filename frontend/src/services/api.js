// Stohill Properties - API Service Layer
import axios from 'axios'
import { useAuthStore } from '@/stores/authStore'

// Same-origin by default: Vite proxies /api in dev and nginx does in prod.
// Override with VITE_API_BASE_URL only if the API lives on another origin.
const BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1/'

// Endpoints that must never trigger the refresh-and-retry flow. A 401 from
// login means "wrong password", not "expired token".
const AUTH_ENDPOINTS = ['auth/login/', 'auth/refresh/']

const api = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000,
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
    const { refreshToken, user, setAuth } = useAuthStore.getState()
    refreshPromise = axios
      .post(`${BASE_URL}auth/refresh/`, { refresh: refreshToken })
      .then(({ data }) => {
        // The backend rotates refresh tokens: always store the new one.
        setAuth(user, data.access, data.refresh ?? refreshToken)
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
      if (!useAuthStore.getState().refreshToken) {
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
  // Revokes the refresh token server-side so a stolen copy can't be reused.
  logout: (refresh) => api.post('auth/logout/', { refresh }),
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
    inviteToPortal: (id) => api.post(`crm/contacts/${id}/invite_to_portal/`),
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
    complete: (id) => api.post(`crm/activities/${id}/complete/`),
  },
  tags: {
    list: () => api.get('crm/tags/'),
    create: (data) => api.post('crm/tags/', data),
  },
  notes: {
    list: (params) => api.get('crm/notes/', { params }),
    create: (data) => api.post('crm/notes/', data),
  },
  lostReasons: {
    list: () => api.get('crm/lost-reasons/'),
    create: (data) => api.post('crm/lost-reasons/', data),
    update: (id, data) => api.patch(`crm/lost-reasons/${id}/`, data),
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
    adjustRental: (id, amount) => api.post(`rentals/leases/${id}/adjust_rental/`, { monthly_rental: amount }),
    generateInvoices: (id, asOf) => api.post(`rentals/leases/${id}/generate_invoices/`, { as_of: asOf }),
    recordDeposit: (id, data) => api.post(`rentals/leases/${id}/record_deposit/`, data),
    refundDeposit: (id, data) => api.post(`rentals/leases/${id}/refund_deposit/`, data),
    renew: (id, data) => api.post(`rentals/leases/${id}/renew/`, data),
    terminate: (id, data) => api.post(`rentals/leases/${id}/terminate/`, data),
    stats: () => api.get('rentals/leases/stats/'),
  },
  invoices: {
    list: (params) => api.get('rentals/invoices/', { params }),
    detail: (id) => api.get(`rentals/invoices/${id}/`),
    create: (data) => api.post('rentals/invoices/', data),
    update: (id, data) => api.patch(`rentals/invoices/${id}/`, data),
  },
  payments: {
    list: (params) => api.get('rentals/payments/', { params }),
    create: (data) => api.post('rentals/payments/', data),
  },
  maintenance: {
    list: (params) => api.get('rentals/maintenance/', { params }),
    create: (data) => api.post('rentals/maintenance/', data),
    update: (id, data) => api.patch(`rentals/maintenance/${id}/`, data),
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
  },
  accounts: {
    list: (params) => api.get('finance/accounts/', { params }),
    search: (q) => api.get('finance/account-search/', { params: { q } }),
    detail: (id) => api.get(`finance/accounts/${id}/`),
    create: (data) => api.post('finance/accounts/', data),
    update: (id, data) => api.patch(`finance/accounts/${id}/`, data),
  },
  journals: {
    list: (params) => api.get('finance/journals/', { params }),
  },
  batches: {
    list: (params) => api.get('finance/batches/', { params }),
    detail: (id) => api.get(`finance/batches/${id}/`),
    create: (data) => api.post('finance/batches/', data),
    update: (id, data) => api.patch(`finance/batches/${id}/`, data),
    submit: (id) => api.post(`finance/batches/${id}/submit_for_approval/`),
    approve: (id) => api.post(`finance/batches/${id}/approve/`),
    post: (id) => api.post(`finance/batches/${id}/post_batch/`),
  },
  entries: {
    list: (params) => api.get('finance/entries/', { params }),
    detail: (id) => api.get(`finance/entries/${id}/`),
    create: (data) => api.post('finance/entries/', data),
    update: (id, data) => api.patch(`finance/entries/${id}/`, data),
    post: (id) => api.post(`finance/entries/${id}/post_entry/`),
    reverse: (id) => api.post(`finance/entries/${id}/reverse/`),
  },
  allocations: {
    ar: (params) => api.get('finance/ar-allocations/', { params }),
    ap: (params) => api.get('finance/ap-allocations/', { params }),
  },
  costCenters: {
    list: (params) => api.get('finance/cost-centers/', { params }),
    create: (data) => api.post('finance/cost-centers/', data),
    update: (id, data) => api.patch(`finance/cost-centers/${id}/`, data),
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
      runDepreciation: (data) => api.post('fixed-assets/assets/run-depreciation/', data),
      dispose: (id, data) => api.post(`fixed-assets/assets/${id}/dispose/`, data),
    },
    transactions: {
      list: (params) => api.get('fixed-assets/transactions/', { params }),
    }
  },
  ap: {
    suppliers: {
      list: (params) => api.get('finance/suppliers/', { params }),
      detail: (id) => api.get(`finance/suppliers/${id}/`),
      create: (data) => api.post('finance/suppliers/', data),
      update: (id, data) => api.patch(`finance/suppliers/${id}/`, data),
      delete: (id) => api.delete(`finance/suppliers/${id}/`),
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
      statement: (id, params) => api.get(`finance/customers/${id}/statement/`, { params }),
      statementPdf: (id, params) => api.get(`finance/customers/${id}/statement/`, { params: { ...params, export_format: 'pdf' }, responseType: 'blob' }),
      emailStatement: (id, data) => api.post(`finance/customers/${id}/email_statement/`, data),
    },
    invoices: {
      list: (params) => api.get('finance/customer-invoices/', { params }),
      detail: (id) => api.get(`finance/customer-invoices/${id}/`),
      create: (data) => api.post('finance/customer-invoices/', data),
      update: (id, data) => api.patch(`finance/customer-invoices/${id}/`, data),
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
      create: (data) => api.post('finance/customer-receipts/', data),
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
    stats: (id) => api.get(`banking/accounts/${id}/stats/`),
    unmatchedLedger: (id) => api.get(`banking/accounts/${id}/unmatched_ledger/`),
    reconciliation: (id, asOf) => api.get(`banking/accounts/${id}/reconciliation/`, { params: { as_of: asOf } }),
  },
  statements: {
    list: (params) => api.get('banking/statements/', { params }),
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
  costReport: (id) => api.get(`projects/${id}/cost_report/`),
  capitalise: (id, data) => api.post(`projects/${id}/capitalise/`, data),
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
  approve: (id) => api.post(`commissions/records/${id}/approve/`),
  stats: () => api.get('commissions/records/stats/'),
  structures: {
    list: (params) => api.get('commissions/structures/', { params }),
    create: (data) => api.post('commissions/structures/', data),
    update: (id, data) => api.patch(`commissions/structures/${id}/`, data),
  },
}

export const documentsAPI = {
  list: (params) => api.get('documents/', { params }),
  detail: (id) => api.get(`documents/${id}/`),
  upload: (formData) => api.post('documents/', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
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
    statement: (id) => api.get(`hr/employees/${id}/statement/`),
  },
  departments: { 
    list: () => api.get('hr/departments/'),
    create: (data) => api.post('hr/departments/', data),
    update: (id, data) => api.patch(`hr/departments/${id}/`, data),
  },
  leave: {
    list: (params) => api.get('hr/leave/', { params }),
    create: (data) => api.post('hr/leave/', data),
    update: (id, data) => api.patch(`hr/leave/${id}/`, data),
  },
  contracts: {
    list: (params) => api.get('hr/contracts/', { params }),
    detail: (id) => api.get(`hr/contracts/${id}/`),
    create: (data) => api.post('hr/contracts/', data),
    update: (id, data) => api.patch(`hr/contracts/${id}/`, data),
  },
  jobPositions: {
    list: (params) => api.get('hr/job-positions/', { params }),
  },
}

export const payrollAPI = {
  runs: {
    list: (params) => api.get('payroll/runs/', { params }),
    detail: (id) => api.get(`payroll/runs/${id}/`),
    create: (data) => api.post('payroll/runs/', data),
    update: (id, data) => api.patch(`payroll/runs/${id}/`, data),
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
    setPassword: (id, data) => api.post(`core/users/${id}/set-password/`, data),
    sodConflicts: (id) => api.get(`core/users/${id}/sod_conflicts/`),
  },
  roles: {
    list: (params) => api.get('core/roles/', { params }),
    detail: (id) => api.get(`core/roles/${id}/`),
    create: (data) => api.post('core/roles/', data),
    update: (id, data) => api.patch(`core/roles/${id}/`, data),
  },
  modules: {
    list: (params) => api.get('core/modules/', { params }),
  },
  sodRules: {
    list: (params) => api.get('core/sod-rules/', { params }),
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
export async function downloadPrivateFile(url, fallbackName = 'download') {
  const path = url.replace(/^\/api\/v1\//, '')
  const response = await api.get(path, { responseType: 'blob' })
  const disposition = response.headers?.['content-disposition'] || ''
  const match = /filename\*=UTF-8''([^;]+)/.exec(disposition)
  const filename = match ? decodeURIComponent(match[1]) : fallbackName
  const href = window.URL.createObjectURL(response.data)
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
 * Sign the user out everywhere this refresh token is used.
 * Server-side revocation is best-effort: local state is always cleared,
 * even if the network call fails (e.g. the token already expired).
 */
export async function signOut() {
  const { refreshToken, logout } = useAuthStore.getState()
  try {
    if (refreshToken) await authAPI.logout(refreshToken)
  } catch {
    // Ignore: an expired/invalid token needs no revocation.
  } finally {
    logout()
  }
}
