import { toZonedTime } from 'date-fns-tz';
function getJapanTime(): Date {
  return toZonedTime(new Date(), 'Asia/Tokyo');
}
export default getJapanTime;
