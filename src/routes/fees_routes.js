import express from 'express';
import { createVoucher, deleteVoucher, getStudentVouchers, getVoucher, updatePayment } from '../controllers/fees_controllers.js';

const router = express.Router();

router.post('/vouchers', createVoucher);
router.get('/vouchers/:id', getVoucher);
router.patch('/vouchers/:id/pay', updatePayment);
router.get('/student/:studentId', getStudentVouchers);
router.delete('/vouchers/:id', deleteVoucher);

export default router;