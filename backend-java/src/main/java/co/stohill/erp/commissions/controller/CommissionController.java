package co.stohill.erp.commissions.controller;

import co.stohill.erp.commissions.models.CommissionRecord;
import co.stohill.erp.commissions.repository.CommissionRecordRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/commissions")
@RequiredArgsConstructor
public class CommissionController {

    private final CommissionRecordRepository commissionRepository;

    @GetMapping
    public List<CommissionRecord> getAllCommissions() {
        return commissionRepository.findAll();
    }

    @SuppressWarnings("null")
    @GetMapping("/{id}")
    public ResponseEntity<CommissionRecord> getCommissionById(@PathVariable UUID id) {
        return commissionRepository.findById(id)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }
}
