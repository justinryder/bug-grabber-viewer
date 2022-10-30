import { MemoryRouter as Router, Routes, Route } from 'react-router-dom';
import './App.css';
import React, { FocusEvent, useEffect, useState } from 'react';
import { sortBy } from 'naan-utils';

const { ipcRenderer } = window.electron;

const useBugGrabberDb = <T,>() => {
  const [db, setDb] = useState<T | null>(null);

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handleDbChange = (data: any) => {
      console.log('change', data);
      setDb(data.db as T);
    };
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    return ipcRenderer.on('BugGrabberDB_Change', handleDbChange);
  }, []);

  return db;
};

const LineItem = ({
  label,
  value,
  vertical = false,
}: {
  label: string;
  value: any;
  // eslint-disable-next-line react/require-default-props
  vertical?: boolean;
}) => {
  return (
    <div
      className={['line-item', vertical ? 'is-vertical' : 'is-horizontal']
        .filter(Boolean)
        .join(' ')}
    >
      <div className="line-item__label">{label}</div>
      <div className="line-item__value">{value}</div>
    </div>
  );
};

type BugGrabberError = {
  message?: string;
  time?: string;
  stack?: string;
  session?: number;
  counter?: number;
};

type BugGrabberDb = {
  session?: number;
  lastSanitation?: number;
  errors?: Array<BugGrabberError | null>;
};

const StackDisplay = ({ stack }: { stack: string }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const handleFocus = (event: FocusEvent<HTMLPreElement>) => {
    const range = document.createRange();
    range.selectNodeContents(event.target);
    const sel = window.getSelection();
    if (sel) {
      sel.removeAllRanges();
      sel.addRange(range);
    }
    if (!isExpanded) {
      setIsExpanded(true);
    }
  };

  const handleBlur = () => setIsExpanded(false);

  return (
    <pre
      className={['bug-grabber-db', isExpanded ? 'is-expanded' : 'is-collapsed']
        .filter(Boolean)
        .join(' ')}
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
      tabIndex={0}
      onFocus={handleFocus}
      onBlur={handleBlur}
    >
      {stack}
    </pre>
  );
};

const ErrorDisplay = ({ error }: { error: BugGrabberError }) => (
  <div className="error-display">
    {error.message && <LineItem label="Message" value={error.message} />}
    {error.time && <LineItem label="Time" value={error.time} />}
    {error.session && <LineItem label="Session" value={error.session} />}
    {error.counter && <LineItem label="Counter" value={error.counter} />}
    <LineItem
      label="Stack"
      value={error.stack ? <StackDisplay stack={error.stack} /> : 'None'}
      vertical={Boolean(error.stack)}
    />
  </div>
);

const Hello = () => {
  const db = useBugGrabberDb<BugGrabberDb>();

  return (
    <div className="app">
      <h1>!BugGrabber Viewer</h1>
      {db ? (
        <>
          {db.session && <LineItem label="Session" value={db.session} />}
          {db.lastSanitation && (
            <LineItem label="Last Sanitization" value={db.lastSanitation} />
          )}
          <div className="app__errors">
            {db.errors
              ?.filter(Boolean)
              ?.sort(sortBy((error) => error?.counter))
              ?.reverse()
              ?.map((error, index) => (
                // eslint-disable-next-line react/no-array-index-key
                <ErrorDisplay key={index} error={error as BugGrabberError} />
              ))}
          </div>
        </>
      ) : (
        <div>No !BugGrabber.lua file found</div>
      )}
    </div>
  );
};

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Hello />} />
      </Routes>
    </Router>
  );
}
