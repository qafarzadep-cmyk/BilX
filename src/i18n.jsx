/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useMemo, useState } from 'react'

const translations = {
  az: {
    search: 'Kurs axtar...',
    searchLabel: 'Axtar',
    login: 'Giriş',
    loginAction: 'Giriş et',
    register: 'Qeydiyyat',
    registerAction: 'Qeydiyyatdan keç',
    email: 'E-poçt',
    password: 'Şifrə',
    fullName: 'Ad',
    surname: 'Soyad',
    accountType: 'Hesab növü',
    student: 'Tələbə',
    instructor: 'Müəllim',
    loading: 'Yüklənir...',
    welcome: 'Xoş gəldiniz!',
    noAccount: 'Hesabın yoxdur?',
    hasAccount: 'Hesabın var?',
    registerSuccess: 'Qeydiyyat uğurlu oldu!',
    fillAllFields: 'Bütün sahələri doldurun.',
    errorOccurred: 'Xəta baş verdi: ',
    userNotFound: 'İstifadəçi tapılmadı.',
    coursePrice: 'Kurs qiyməti',
    videoNotSupported: 'Brauzeriniz video dəstəkləmir.',
  },
}

const LanguageContext = createContext(null)

export function LanguageProvider({ children }) {
  const [language, setLanguageState] = useState('az')

  useEffect(() => {
    localStorage.setItem('bilx-language', 'az')
    document.documentElement.lang = language
  }, [language])

  const value = useMemo(
    () => ({
      language,
      setLanguage: () => setLanguageState('az'),
      t: (key) => translations[language]?.[key] || translations.az[key] || key,
    }),
    [language]
  )

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

export function useLanguage() {
  return useContext(LanguageContext)
}
