// Fixed asset settings: asset categories and the GL accounts each one posts to.
import { Boxes } from 'lucide-react'
import { financeAPI, fixedAssetsAPI } from '@/services/api'
import CrudTable from '@/components/common/CrudTable'
import SettingsPage from '@/components/common/SettingsPage'
import { useOptions } from '@/pages/propman/common'

function AssetCategories() {
  const accounts = useOptions(['accounts', 'all-options'], () => financeAPI.accounts.list({ page_size: 1000 }),
    (a) => [a.id, `${a.code} ${a.name}`])
  return (
    <CrudTable label="asset category" queryKey={['asset-categories']} api={fixedAssetsAPI.categories}
      description="Every asset belongs to a category, which sets the accounts its cost, depreciation and disposal post to. Assets bought through Purchasing get the category's default life. Categories with assets cannot be deleted."
      columns={[
        { key: 'code', label: 'Code' },
        { key: 'name', label: 'Name' },
        { key: 'asset_cost_account_code', label: 'Cost' },
        { key: 'accum_depr_account_code', label: 'Accum. depr.' },
        { key: 'depr_expense_account_code', label: 'Depr. expense' },
        { key: 'disposal_gain_loss_account_code', label: 'Disposal' },
        { key: 'default_useful_life_months', label: 'Life (months)', align: 'right' },
      ]}
      fields={[
        { key: 'code', label: 'Code', required: true, readOnlyOnEdit: true, placeholder: 'e.g. VEH' },
        { key: 'name', label: 'Name', required: true },
        { key: 'description', label: 'Description' },
        { key: 'default_useful_life_months', label: 'Default life (months)', type: 'number' },
        { key: 'asset_cost_account', label: 'Asset cost account', type: 'select', options: accounts, required: true },
        { key: 'accum_depr_account', label: 'Accumulated depreciation', type: 'select', options: accounts, required: true },
        { key: 'depr_expense_account', label: 'Depreciation expense', type: 'select', options: accounts, required: true },
        { key: 'disposal_gain_loss_account', label: 'Gain / loss on disposal', type: 'select', options: accounts, required: true },
      ]}
      defaults={{ default_useful_life_months: 60 }} />
  )
}

const TABS = [{ id: 'categories', label: 'Asset categories', icon: Boxes, render: () => <AssetCategories /> }]

export default function AssetSettingsPage() {
  return (
    <SettingsPage title="Fixed asset settings" backTo="/finance/assets" backLabel="Fixed assets"
      description="Asset categories and the accounts they post to." tabs={TABS} />
  )
}
