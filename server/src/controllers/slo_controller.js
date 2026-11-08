// @ts-check
import { getAllSLOs, getSLOById } from '../services/slo_service.js';

export async function getSLOs(req, res, next) {
  try {
    const data = getAllSLOs();
    return res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

export async function getSLOByIdHandler(req, res, next) {
  try {
    const { id } = req.params;
    const data = getSLOById(id);
    return res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

export default {
  getSLOs,
  getSLOByIdHandler,
};
