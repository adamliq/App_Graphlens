import React, { useState } from 'react';
import PropTypes from 'prop-types';
import Modal from '@splunk/react-ui/Modal';
import Button from '@splunk/react-ui/Button';
import Select from '@splunk/react-ui/Select';

const FORMAT_OPTIONS = [
  { value: 'json', label: 'JSON (graph)' },
  { value: 'csv-nodes', label: 'CSV (nodes)' },
  { value: 'csv-edges', label: 'CSV (edges)' },
  { value: 'png', label: 'PNG (image)' },
];

export default function ExportDialog({ open, allowedFormats, onClose, onExport }) {
  const [format, setFormat] = useState(allowedFormats[0] || 'json');

  if (!open) return null;

  const options = FORMAT_OPTIONS.filter((f) => allowedFormats.includes(f.value));

  return (
    <Modal onRequestClose={onClose} open={open} style={{ width: 420 }}>
      <Modal.Header title="Export graph" onRequestClose={onClose} />
      <Modal.Body>
        <p style={{ fontSize: 13 }}>
          Exports include only the nodes and relationships currently visible to you and already
          returned by your own searches.
        </p>
        <label htmlFor="graphlens-export-format" style={{ fontSize: 12 }}>
          Format
          <Select inputId="graphlens-export-format" value={format} onChange={(e, { value }) => setFormat(value)}>
            {options.map((o) => <Select.Option key={o.value} label={o.label} value={o.value} />)}
          </Select>
        </label>
      </Modal.Body>
      <Modal.Footer>
        <Button label="Cancel" onClick={onClose} appearance="secondary" />
        <Button label="Export" appearance="primary" onClick={() => onExport(format)} />
      </Modal.Footer>
    </Modal>
  );
}

ExportDialog.propTypes = {
  open: PropTypes.bool.isRequired,
  allowedFormats: PropTypes.array.isRequired,
  onClose: PropTypes.func.isRequired,
  onExport: PropTypes.func.isRequired,
};
