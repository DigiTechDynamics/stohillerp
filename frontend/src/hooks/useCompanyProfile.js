import { useQuery } from '@tanstack/react-query'
import { companyAPI } from '@/services/api'
import { setDefaultCurrency } from '@/utils/format'

// The company's name, contact details and reporting currency (core/company/).
// Loading it also sets the default currency used by formatCurrency.
export function useCompanyProfile() {
  return useQuery({
    queryKey: ['company-profile'],
    queryFn: async () => {
      const { data } = await companyAPI.profile()
      setDefaultCurrency(data.currency)
      return data
    },
    staleTime: 60 * 60 * 1000,
  })
}
