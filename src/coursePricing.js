import { A1_COURSE_ID, A1_COURSE_TITLE } from './courseIdentity'

const LAUNCH_OFFER = {
  courseId: A1_COURSE_ID,
  courseTitle: A1_COURSE_TITLE,
  price: 34.9,
  regularPrice: 59.9,
  endsOn: '20 avqustadək',
}

export function getCoursePricing(course) {
  if (String(course?.id) === LAUNCH_OFFER.courseId || course?.title === LAUNCH_OFFER.courseTitle) {
    return {
      currentPrice: LAUNCH_OFFER.price,
      regularPrice: LAUNCH_OFFER.regularPrice,
      endsOn: LAUNCH_OFFER.endsOn,
      isOffer: true,
    }
  }

  return {
    currentPrice: Number(course?.price) || 0,
    regularPrice: Number(course?.regular_price) || null,
    endsOn: '',
    isOffer: false,
  }
}

export function formatCoursePrice(value) {
  return `${Number(value || 0).toFixed(2)} AZN`
}
