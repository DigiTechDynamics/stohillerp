// Stohill Properties - API Service Layer
import axios from 'axios'
import { useAuthStore } from '@/stores/authStore'

const BASE_URL = '/api/v1/'

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

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true
      const refreshToken = useAuthStore.getState().refreshToken
      if (refreshToken) {
        try {
          const { data } = await axios.post(`${BASE_URL}auth/refresh/`, { refresh: refreshToken })
          useAuthStore.getState().setAuth(useAuthStore.getState().user, data.access, refreshToken)
          originalRequest.headers.Authorization = `Bearer ${data.access}`
          return api(originalRequest)
        } catch {
          useAuthStore.getState().logout()
          window.location.href = '/login'
        }
      } else {
        useAuthStore.getState().logout()
        window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  }
)

export const authAPI = {
  login: (email, password) => api.post('auth/login/', { email, password }),
  forgotPassword: (email) => api.post('auth/forgot-password/', { email }),
  resetPassword: (uid, token, new_password) => api.post('auth/reset-password/', { uid, token, new_password }),
  me: () => api.get('core/me/'),
  updateMe: (data) => {
    const headers = data instanceof FormData ? { 'Content-Type': 'multipart/form-data' } : {}
    return api.patch('core/me/', data, { headers })
  },
  currencies: {
    list: (params) => api.get('core/currencies/', { params }),
  },
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
}

export const rentalsAPI = {
  leases: {
    list: (params) => api.get('rentals/leases/', { params }),
    detail: (id) => api.get(`rentals/leases/${id}/`),
    create: (data) => api.post('rentals/leases/', data),
    update: (id, data) => api.patch(`rentals/leases/${id}/`, data),
    adjustRental: (id, amount) => api.post(`rentals/leases/${id}/adjust_rental/`, { monthly_rental: amount }),
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
    },
    invoices: {
      list: (params) => api.get('finance/supplier-invoices/', { params }),
      detail: (id) => api.get(`finance/supplier-invoices/${id}/`),
      create: (data) => api.post('finance/supplier-invoices/', data),
      update: (id, data) => api.patch(`finance/supplier-invoices/${id}/`, data),
      delete: (id) => api.delete(`finance/supplier-invoices/${id}/`),
      review: (id) => api.post(`finance/supplier-invoices/${id}/review_invoice/`),
      post: (id) => api.post(`finance/supplier-invoices/${id}/post_invoice/`),
    },
    payments: {
      list: (params) => api.get('finance/supplier-payments/', { params }),
      detail: (id) => api.get(`finance/supplier-payments/${id}/`),
      create: (data) => api.post('finance/supplier-payments/', data),
      post: (id) => api.post(`finance/supplier-payments/${id}/post_payment/`),
    }
  },
  ar: {
    customers: {
      list: (params) => api.get('finance/customers/', { params }),
      detail: (id) => api.get(`finance/customers/${id}/`),
      create: (data) => api.post('finance/customers/', data),
      update: (id, data) => api.patch(`finance/customers/${id}/`, data),
    },
    invoices: {
      list: (params) => api.get('finance/customer-invoices/', { params }),
      detail: (id) => api.get(`finance/customer-invoices/${id}/`),
      create: (data) => api.post('finance/customer-invoices/', data),
      update: (id, data) => api.patch(`finance/customer-invoices/${id}/`, data),
      post: (id) => api.post(`finance/customer-invoices/${id}/post_invoice/`),
      email: (id) => api.post(`finance/customer-invoices/${id}/email_invoice/`),
    },
    receipts: {
      list: (params) => api.get('finance/customer-receipts/', { params }),
      detail: (id) => api.get(`finance/customer-receipts/${id}/`),
      create: (data) => api.post('finance/customer-receipts/', data),
      post: (id) => api.post(`finance/customer-receipts/${id}/post_receipt/`),
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
  },
  statements: {
    list: (params) => api.get('banking/statements/', { params }),
    detail: (id) => api.get(`banking/statements/${id}/`),
    create: (data) => api.post('banking/statements/', data),
    auto_match: (id) => api.post(`banking/statements/${id}/auto_match/`),
    process_statement: (id) => api.post(`banking/statements/${id}/process_statement/`),
  },
  lines: {
    list: (params) => api.get('banking/lines/', { params }),
    reconcile: (id, data) => api.post(`banking/lines/${id}/reconcile_manually/`, data),
  },
  rules: {
    list: (params) => api.get('banking/reconciliation-rules/', { params }),
    create: (data) => api.post('banking/reconciliation-rules/', data),
    update: (id, data) => api.patch(`banking/reconciliation-rules/${id}/`, data),
    delete: (id) => api.delete(`banking/reconciliation-rules/${id}/`),
  }
}

export const fixedAssetsAPI = financeAPI.fixedAssets

export const commissionsAPI = {
  list: (params) => api.get('commissions/records/', { params }),
  detail: (id) => api.get(`commissions/records/${id}/`),
  approve: (id) => api.post(`commissions/records/${id}/approve/`),
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
  update: (id, data) => api.patch(`documents/${id}/`, data),
  delete: (id) => api.delete(`documents/${id}/`),
  workspaces: {
    list: (params) => api.get('documents/workspaces/', { params }),
    create: (data) => api.post('documents/workspaces/', data),
  },
  categories: {
    list: (params) => api.get('documents/categories/', { params }),
  },
  tags: {
    list: (params) => api.get('documents/tags/', { params }),
    create: (data) => api.post('documents/tags/', data),
  },
  compliance: { list: (params) => api.get('documents/compliance/', { params }) },
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

export const notificationsAPI = {
  list: (params) => api.get('notifications/', { params }),
  markRead: (id) => api.post(`notifications/${id}/mark_read/`),
  markAllRead: () => api.post('notifications/mark_all_read/'),
  unreadCount: () => api.get('notifications/unread_count/'),
}

export default api
