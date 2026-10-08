// The one place the currency list is fetched. Every screen shares the
// ['currencies'] cache, so they must all store the same shape: a plain array.
import { useQuery } from '@tanstack/react-query'
import { financeAPI } from '@/services/api'

const NONE = []

export function useCurrencies() {
  const query = useQuery({
    queryKey: ['currencies'],
    queryFn: async () => {
      const { data } = await financeAPI.currencies.list({ page_size: 500 })
      return data?.results || data || []
    },
    staleTime: 1000 * 60 * 5,
  })
  const currencies = query.data || NONE
  return { ...query, currencies, baseCurrency: currencies.find((c) => c.is_base) || null }
}
