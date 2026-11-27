import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import Modal from '@splunk/react-ui/Modal';
import Button from '@splunk/react-ui/Button';

const PREVIEW_ROW_LIMIT = 200;

/**
 * The pre-import CSV table editor (1.19.0, gated by the
 * graphlens_edit_graph_data capability - see RelationshipExplorer/
 * App.jsx's handleImportFile). Shown instead of loading a picked CSV
 * file straight onto the canvas: lets a user fix a cell (a typo'd risk
 * score, a wrong label) before anything is classified or admitted. This
 * edits the in-memory rows only - never the file on disk - and those
 * rows still go through the exact same classification
 * (jobResultsService.js's classifyJobResultRows) and
 * graphTransformer.transformRowsToGraph validation/escaping/limit
 * enforcement a direct (no-edit) CSV import already goes through; a
 * hand-typed cell can never bypass that.
 *
 * Bounded to PREVIEW_ROW_LIMIT editable rows for the same reason every
 * other view in this app is bounded - an inline-editable HTML table of
 * an arbitrarily large CSV would be unusable, not just slow. Rows
 * beyond the limit are still loaded on Load, just not editable here.
 */
export default function CsvImportPreviewDialog({ open, header, rows, fileName, error, onClose, onLoad }) {
  const [editedRows, setEditedRows] = useState(rows);

  useEffect(() => {
    setEditedRows(rows);
  }, [rows]);

  if (!open) return null;

  const previewRows = editedRows.slice(0, PREVIEW_ROW_LIMIT);
  const hiddenCount = editedRows.length - previewRows.length;

  const updateCell = (rowIndex, column, value) => {
    setEditedRows((prev) => prev.map((r, i) => (i === rowIndex ? { ...r, [column]: value } : r)));
  };

  return (
    <Modal onRequestClose={onClose} open={open} style={{ width: 760 }}>
      <Modal.Header title="Review CSV before loading" onRequestClose={onClose} />
      <Modal.Body>
        <p style={{ fontSize: 13 }}>
          {fileName ? `${fileName} - ` : ''}
          {editedRows.length} row{editedRows.length === 1 ? '' : 's'} parsed. Fix any cell
          below before loading it onto the canvas - this only changes
          what gets loaded, not the file itself. Rows must still match
          the relationship schema (see the Help page) once loaded; rows
          matching neither a node row nor an edge row are silently
          skipped, the same as every other relationship source.
          {hiddenCount > 0 && ` Showing the first ${PREVIEW_ROW_LIMIT} rows for editing; the remaining ${hiddenCount} will still be loaded unedited.`}
        </p>
        {error && (
          <div className="graphlens-error-banner" role="status">
            {error}
          </div>
        )}
        <div style={{ overflow: 'auto', maxHeight: 400, border: '1px solid #e5e5e5' }}>
          <table className="graphlens-data-table graphlens-data-table-editable">
            <thead>
              <tr>
                {header.map((h) => (
                  <th key={h}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {previewRows.map((row, rowIndex) => (
                // eslint-disable-next-line react/no-array-index-key
                <tr key={rowIndex}>
                  {header.map((h) => (
                    <td key={h}>
                      <input
                        type="text"
                        value={row[h] !== undefined ? row[h] : ''}
                        onChange={(e) => updateCell(rowIndex, h, e.target.value)}
                        className="graphlens-cell-input"
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Modal.Body>
      <Modal.Footer>
        <Button label="Cancel" appearance="secondary" onClick={onClose} />
        <Button label="Load" appearance="primary" onClick={() => onLoad(editedRows)} />
      </Modal.Footer>
    </Modal>
  );
}

CsvImportPreviewDialog.propTypes = {
  open: PropTypes.bool.isRequired,
  header: PropTypes.arrayOf(PropTypes.string).isRequired,
  rows: PropTypes.array.isRequired,
  fileName: PropTypes.string,
  error: PropTypes.string,
  onClose: PropTypes.func.isRequired,
  onLoad: PropTypes.func.isRequired,
};

CsvImportPreviewDialog.defaultProps = {
  fileName: null,
  error: null,
};
