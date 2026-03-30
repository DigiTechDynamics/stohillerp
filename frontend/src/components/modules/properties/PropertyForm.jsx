import { useState, forwardRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Building2, MapPin, Home, Info, Square, BedDouble, Bath, Car, Save, X, Loader2 } from 'lucide-react'
import { propertiesAPI } from '@/services/api'
import { useUIStore } from '@/stores/authStore'
import { toast } from 'react-hot-toast'
import CurrencySelect from '@/components/common/CurrencySelect'

const PropertyForm = forwardRef((props, ref) => {
  const queryClient = useQueryClient()
  const sidePanelData = useUIStore(s => s.sidePanelData)
  const closeSidePanel = useUIStore(s => s.closeSidePanel)
  const property = sidePanelData?.property
  const isEdit = !!property

  const [formData, setFormData] = useState({
    name: property?.name || '',
    property_type_id: property?.property_type?.id || '',
    status: property?.status || 'available',
    ownership_type: property?.ownership_type || 'owned',
    address_line1: property?.address_line1 || '',
    address_line2: property?.address_line2 || '',
    suburb: property?.suburb || '',
    city: property?.city || '',
    province: property?.province || '',
    postal_code: property?.postal_code || '',
    country: property?.country || 'South Africa',
    erf_size: property?.erf_size || '',
    floor_size: property?.floor_size || '',
    bedrooms: property?.bedrooms || '',
    bathrooms: property?.bathrooms || '',
    garages: property?.garages || '',
    parking_bays: property?.parking_bays || '',
    asking_price: property?.asking_price || '',
    rental_rate: property?.rental_rate || '',
    currency: property?.currency || '',
    description: property?.description || '',
  })

  // Fetch Property Types
  const { data: typesData } = useQuery({
    queryKey: ['property-types'],
    queryFn: () => propertiesAPI.listTypes(),
  })
  const propertyTypes = Array.isArray(typesData?.data) ? typesData.data : (typesData?.data?.results || [])

  const mutation = useMutation({
    mutationFn: (data) => isEdit 
      ? propertiesAPI.update(property.id, data) 
      : propertiesAPI.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['properties'] })
      toast.success(`Property ${isEdit ? 'updated' : 'created'} successfully`)
      closeSidePanel()
    },
    onError: (error) => {
      const msg = error.response?.data?.error?.message || error.message
      toast.error(`Error: ${typeof msg === 'object' ? JSON.stringify(msg) : msg}`)
    }
  })

  const handleChange = (e) => {
    const { name, value, type } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: type === 'number' ? (value === '' ? '' : parseFloat(value)) : value
    }))
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!formData.name || !formData.property_type_id || !formData.address_line1) {
      toast.error('Please fill in all required fields (Name, Type, Address)')
      return
    }

    const payload = { ...formData }
    const numericFields = [
      'erf_size', 'floor_size', 'bedrooms', 'bathrooms',
      'garages', 'parking_bays', 'asking_price', 'rental_rate'
    ]
    numericFields.forEach(field => {
      if (payload[field] === '') {
        payload[field] = null
      }
    })

    // Remove empty optional string fields if they are missing required or if backend complains
    if (!payload.suburb) delete payload.suburb
    if (!payload.city) delete payload.city
    if (!payload.province) delete payload.province
    if (!payload.postal_code) delete payload.postal_code

    mutation.mutate(payload)
  }

  return (
    <form ref={ref} onSubmit={handleSubmit} className="p-6 space-y-8">
      {/* Identity Section */}
      <section className="space-y-4">
        <h3 className="text-xs font-bold text-dark-500 uppercase tracking-widest flex items-center gap-2">
          <Info size={14} /> Basic Identity
        </h3>
        <div className="grid grid-cols-1 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs text-dark-400 ml-1">Property Name / Display Name *</label>
            <input
              name="name"
              value={formData.name}
              onChange={handleChange}
              placeholder="e.g. Blue Waters Apartment 302"
              className="form-input"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs text-dark-400 ml-1">Property Type *</label>
              <select
                name="property_type_id"
                value={formData.property_type_id}
                onChange={handleChange}
                className="form-input"
                required
              >
                <option value="">Select Type</option>
                {propertyTypes.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-dark-400 ml-1">Ownership</label>
              <select
                name="ownership_type"
                value={formData.ownership_type}
                onChange={handleChange}
                className="form-input"
              >
                <option value="owned">Company Owned</option>
                <option value="managed">Managed (3rd Party)</option>
                <option value="jv">Joint Venture</option>
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-dark-400 ml-1">Status</label>
            <select
              name="status"
              value={formData.status}
              onChange={handleChange}
              className="form-input"
            >
              <option value="available">Available</option>
              <option value="occupied">Occupied</option>
              <option value="maintenance">Under Maintenance</option>
              <option value="listed_sale">Listed for Sale</option>
              <option value="listed_rent">Listed for Rent</option>
            </select>
          </div>
        </div>
      </section>

      {/* Location Section */}
      <section className="space-y-4 pt-2 border-t border-white/5">
        <h3 className="text-xs font-bold text-dark-500 uppercase tracking-widest flex items-center gap-2">
          <MapPin size={14} /> Location Details
        </h3>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs text-dark-400 ml-1">Address Line 1 *</label>
            <input
              name="address_line1"
              value={formData.address_line1}
              onChange={handleChange}
              placeholder="Street address"
              className="form-input"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs text-dark-400 ml-1">Suburb</label>
              <input
                name="suburb"
                value={formData.suburb}
                onChange={handleChange}
                className="form-input"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-dark-400 ml-1">City</label>
              <input
                name="city"
                value={formData.city}
                onChange={handleChange}
                className="form-input"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs text-dark-400 ml-1">Postal Code</label>
              <input
                name="postal_code"
                value={formData.postal_code}
                onChange={handleChange}
                className="form-input"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-dark-400 ml-1">Province</label>
              <input
                name="province"
                value={formData.province}
                onChange={handleChange}
                className="form-input"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Features & Size Section */}
      <section className="space-y-4 pt-2 border-t border-white/5">
        <h3 className="text-xs font-bold text-dark-500 uppercase tracking-widest flex items-center gap-2">
          <Square size={14} /> Physical Attributes
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs text-dark-400 ml-1">Floor Size (m²)</label>
            <div className="relative">
              <Square size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-500" />
              <input
                type="number"
                name="floor_size"
                value={formData.floor_size}
                onChange={handleChange}
                className="form-input pl-9"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-dark-400 ml-1">Erf Size (m²)</label>
            <input
              type="number"
              name="erf_size"
              value={formData.erf_size}
              onChange={handleChange}
              className="form-input"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-dark-400 ml-1">Bedrooms</label>
            <div className="relative">
              <BedDouble size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-500" />
              <input
                type="number"
                name="bedrooms"
                value={formData.bedrooms}
                onChange={handleChange}
                className="form-input pl-9"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-dark-400 ml-1">Bathrooms</label>
            <div className="relative">
              <Bath size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-500" />
              <input
                type="number"
                name="bathrooms"
                step="0.5"
                value={formData.bathrooms}
                onChange={handleChange}
                className="form-input pl-9"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-dark-400 ml-1">Garages</label>
            <div className="relative">
              <Car size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-500" />
              <input
                type="number"
                name="garages"
                value={formData.garages}
                onChange={handleChange}
                className="form-input pl-9"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-dark-400 ml-1">Parking Bays</label>
            <input
              type="number"
              name="parking_bays"
              value={formData.parking_bays}
              onChange={handleChange}
              className="form-input"
            />
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section className="space-y-4 pt-2 border-t border-white/5">
        <h3 className="text-xs font-bold text-dark-500 uppercase tracking-widest flex items-center gap-2">
          <Home size={14} /> Pricing
        </h3>
        <div className="grid grid-cols-1 gap-4">
          <CurrencySelect 
            value={formData.currency}
            onChange={(val) => setFormData(prev => ({ ...prev, currency: val }))}
            label="Transaction Currency"
            placeholder="Select currency for all financial fields"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs text-dark-400 ml-1">Asking Price (Sale)</label>
            <input
              type="number"
              name="asking_price"
              value={formData.asking_price}
              onChange={handleChange}
              className="form-input"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-dark-400 ml-1">Rental Rate (per month)</label>
            <input
              type="number"
              name="rental_rate"
              value={formData.rental_rate}
              onChange={handleChange}
              className="form-input"
            />
          </div>
        </div>
      </section>

      {/* Description */}
      <section className="space-y-4 pt-2 border-t border-white/5">
        <div className="space-y-1.5">
          <label className="text-xs text-dark-400 ml-1">Public Description</label>
          <textarea
            name="description"
            value={formData.description}
            onChange={handleChange}
            rows={4}
            className="form-input resize-none"
            placeholder="Describe the property features, location highlights, etc."
          />
        </div>
      </section>

      {/* Actions */}
      <div className="pt-6 flex items-center gap-3">
        <button
          type="submit"
          disabled={mutation.isPending}
          className="flex-1 btn-primary py-2.5 flex items-center justify-center gap-2"
        >
          {mutation.isPending ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
          {isEdit ? 'Update Property' : 'Save Property'}
        </button>
        <button
          type="button"
          onClick={closeSidePanel}
          className="btn-secondary px-6 py-2.5"
        >
          Cancel
        </button>
      </div>
    </form>
  )
})

export default PropertyForm
