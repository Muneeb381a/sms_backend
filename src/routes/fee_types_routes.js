import express from 'express';
import {
  getAllFeeTypes,
  getFeeTypeById,
  createFeeType,
  updateFeeType,
  deleteFeeType,
} from '../controllers/fee_types_controllers.js';

const router = express.Router();

router.get('/', getAllFeeTypes);
router.post('/', createFeeType);
router.get('/:id', getFeeTypeById);
router.patch('/:id', updateFeeType);
router.delete('/:id', deleteFeeType);

export default router;