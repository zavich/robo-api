function isAfterDate(date: string, dateToCompare: string) {
  const latestDate = new Date(date?.split('/').reverse().join('-')).setHours(
    0,
    0,
    0,
    0,
  );
  const currentDate = new Date(
    dateToCompare?.split('/').reverse().join('-'),
  ).setHours(0, 0, 0, 0);
  return currentDate >= latestDate;
}

function isBeforeDate(date: string, dateToCompare: string) {
  const latestDate = new Date(date?.split('/').reverse().join('-')).setHours(
    0,
    0,
    0,
    0,
  );
  const currentDate = new Date(
    dateToCompare?.split('/').reverse().join('-'),
  ).setHours(0, 0, 0, 0);
  return currentDate < latestDate;
}

export { isAfterDate, isBeforeDate };
