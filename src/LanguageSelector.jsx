import azFlag from './assets/Flag_of_Azerbaijan_Flat_Round.webp'
import ruFlag from './assets/Flag_of_Russia_Flat_Round.webp'
import enFlag from './assets/Flag_of_United_States_Flat_Round.webp'
import { useLanguage } from './i18n'

const languages = [
  { code: 'az', label: 'AZ', flag: azFlag, altKey: 'flagAz' },
  { code: 'ru', label: 'RU', flag: ruFlag, altKey: 'flagRu' },
  { code: 'en', label: 'ENG', flag: enFlag, altKey: 'flagEn' },
]

function LanguageSelector() {
  const { language, setLanguage, t } = useLanguage()

  return (
    <div
      aria-label={t('languageSelect')}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        padding: '0',
        borderRadius: '999px',
        background: 'transparent',
      }}
    >
      {languages.map((item) => {
        const isActive = language === item.code

        return (
          <button
            key={item.code}
            type="button"
            onClick={() => setLanguage(item.code)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              height: '28px',
              padding: item.code === 'en' ? '4px 7px' : '4px 6px',
              borderRadius: '999px',
              border: 'none',
              background: isActive ? '#eef2ff' : 'transparent',
              color: isActive ? '#1435c3' : '#64748b',
              cursor: 'pointer',
              fontSize: '11px',
              fontWeight: isActive ? '800' : '700',
              lineHeight: 1,
              transition:
                'background 160ms ease, color 160ms ease, opacity 160ms ease',
              boxShadow: 'none',
              opacity: isActive ? 1 : 0.82,
            }}
            onMouseEnter={(e) => {
              if (!isActive) {
                e.currentTarget.style.background = '#f7f9fa'
                e.currentTarget.style.color = '#1435c3'
                e.currentTarget.style.opacity = '1'
              }
            }}
            onMouseLeave={(e) => {
              if (!isActive) {
                e.currentTarget.style.background = 'transparent'
                e.currentTarget.style.color = '#64748b'
                e.currentTarget.style.opacity = '0.82'
              }
            }}
          >
            <img
              src={item.flag}
              alt={t(item.altKey)}
              width={16}
              height={16}
              loading="lazy"
              decoding="async"
              style={{
                width: '16px',
                height: '16px',
                borderRadius: '50%',
                display: 'block',
                boxShadow: 'none',
              }}
            />
            {item.label}
          </button>
        )
      })}
    </div>
  )
}

export default LanguageSelector
