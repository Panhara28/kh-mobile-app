import { fileProblem, parseUserSheet, userRowWarnings, userUploadBody } from './user-import';

const header = ['Full Name', 'Username', 'Phone Number', 'Position', 'Profile'];

describe('file checks', () => {
  it('takes .xlsx and .xls up to 10 MB', () => {
    expect(fileProblem('users.xlsx', 1000)).toBeNull();
    expect(fileProblem('USERS.XLS', 1000)).toBeNull();
    expect(fileProblem('users.csv', 1000)).toContain('Excel');
    expect(fileProblem('users.xlsx', 11 * 1024 * 1024)).toContain('10MB');
    expect(fileProblem('users.xlsx', undefined)).toBeNull();
  });
});

describe('reading the sheet', () => {
  it('reads the five columns, in any order, and skips empty rows', () => {
    const { errors, data } = parseUserSheet([
      ['Username', 'Full Name', 'Position', 'Phone Number', 'Profile'],
      ['johndoe', 'John Doe', 'Cashier', 12345678, 'staff'],
      [null, null, null, null, null],
      [' mary ', 'Mary', 'Service', '098-111', null],
    ]);
    expect(errors).toEqual([]);
    expect(data).toEqual([
      { fullName: 'John Doe', username: 'johndoe', phoneNumber: '12345678', position: 'Cashier', profile: 'staff' },
      { fullName: 'Mary', username: 'mary', phoneNumber: '098-111', position: 'Service', profile: '' },
    ]);
  });
  it('names the missing headers, and needs a header row and some rows', () => {
    expect(parseUserSheet([['Full Name', 'Username']]).errors).toEqual(['Missing required headers: Phone Number, Position, Profile']);
    expect(parseUserSheet([]).errors).toEqual(['Excel file must have a header row']);
    expect(parseUserSheet([header]).errors).toEqual(['The sheet has no user rows']);
  });
});

describe('warnings and the request', () => {
  it('warns about missing or repeated values before sending', () => {
    const rows = [
      { fullName: 'A', username: 'a', phoneNumber: '1', position: 'Cashier', profile: '' },
      { fullName: '', username: 'A', phoneNumber: '1', position: '', profile: '' },
      { fullName: 'C', username: '', phoneNumber: '1', position: 'Cashier', profile: '' },
    ];
    expect(userRowWarnings(rows)).toEqual(['Row 3: Username A is repeated', 'Row 3: no Full Name', 'Row 3: no Position', 'Row 4: no Username']);
    expect(userUploadBody(rows)).toEqual({ data: rows });
  });
});
